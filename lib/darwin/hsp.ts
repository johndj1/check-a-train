import { postJson } from "@/lib/darwin/client";
import { rankServicesForJourney } from "@/lib/darwin/match";
import type {
  DarwinMatchingDiagnostics,
  DarwinNormalizedService,
  HspDayType,
  HspServiceMetricsRequest,
  HspServicesParams,
} from "@/lib/darwin/types";
import { deriveDelayAndStatus } from "@/lib/status/deriveDelayAndStatus";
import { hhmmToMins } from "@/lib/time/hhmm";

type HspServiceMetric = {
  rid: string;
  tocCode: string | null;
  gbttPtd: string | null;
};

type HspLocation = Record<string, unknown>;

type HspServiceDetails = {
  locations: HspLocation[];
  lateCancelReason: string | null;
};

export class HspCredentialsError extends Error {
  constructor(message = "Missing HSP credentials.") {
    super(message);
    this.name = "HspCredentialsError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findValue(obj: Record<string, unknown>, keys: string[]) {
  const wanted = new Set(keys.map(normalizeKey));
  for (const [key, value] of Object.entries(obj)) {
    if (wanted.has(normalizeKey(key))) {
      return value;
    }
  }
  return undefined;
}

function pickString(obj: Record<string, unknown>, keys: string[]) {
  const value = findValue(obj, keys);
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
}

function pickRecord(obj: Record<string, unknown>, keys: string[]) {
  const value = findValue(obj, keys);
  return isRecord(value) ? value : null;
}

function pickRecordArray(obj: Record<string, unknown>, keys: string[]) {
  const value = findValue(obj, keys);
  if (!Array.isArray(value)) return null;
  return value.filter(isRecord);
}

function parseISODate(dateStr: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

function deriveDayType(date: string): HspDayType {
  const parsed = parseISODate(date);
  if (!parsed) return "WEEKDAY";
  const day = parsed.getDay();
  if (day === 6) return "SATURDAY";
  if (day === 0) return "SUNDAY";
  return "WEEKDAY";
}

function clampMins(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1439) return 1439;
  return Math.floor(value);
}

function minsToCompactHHMM(totalMins: number) {
  const clamped = clampMins(totalMins);
  const hh = String(Math.floor(clamped / 60)).padStart(2, "0");
  const mm = String(clamped % 60).padStart(2, "0");
  return `${hh}${mm}`;
}

function toHHMM(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const text = v.trim();
  const compact = /^(\d{2})(\d{2})$/.exec(text);
  if (compact) return `${compact[1]}:${compact[2]}`;
  const colon = /^(\d{1,2}):(\d{2})$/.exec(text);
  const iso = /T(\d{1,2}):(\d{2})/.exec(text);
  const match = colon ?? iso;
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function extractRid(serviceObj: Record<string, unknown>) {
  const direct = serviceObj.rid;
  if (typeof direct === "string" && direct.trim().length > 0) return direct.trim();
  const rids = serviceObj.rids;
  if (Array.isArray(rids)) {
    const first = rids.find((v) => typeof v === "string" && v.trim().length > 0);
    if (typeof first === "string") return first.trim();
  }
  return null;
}

function toMetric(serviceLike: Record<string, unknown>): HspServiceMetric | null {
  const metricObject =
    pickRecordArray(serviceLike, ["serviceAttributesMetrics"])?.[0] ??
    pickRecord(serviceLike, ["serviceAttributesMetrics"]) ??
    serviceLike;
  if (!isRecord(metricObject)) return null;
  const rid = extractRid(serviceLike) ?? extractRid(metricObject);
  if (!rid) return null;
  return {
    rid,
    tocCode: pickString(metricObject, ["toc_code", "tocCode"]),
    gbttPtd: pickString(metricObject, ["gbtt_ptd", "gbttPtd"]),
  };
}

function extractMetrics(payload: unknown) {
  if (!isRecord(payload)) return [];
  const candidates =
    pickRecordArray(payload, ["Services", "services", "serviceMetrics", "data"]) ??
    [];
  return candidates
    .map((entry) => (isRecord(entry) ? toMetric(entry) : null))
    .filter((v): v is HspServiceMetric => v !== null);
}

function parseServiceDetailsPayload(payload: unknown): HspServiceDetails {
  const root = isRecord(payload) ? payload : {};
  const detailRoot =
    pickRecordArray(root, ["Services", "services", "serviceDetails"])?.[0] ??
    pickRecord(root, ["serviceDetails"]) ??
    root;
  const detailObj = isRecord(detailRoot) ? detailRoot : {};
  return {
    locations: pickRecordArray(detailObj, ["locations"]) ?? [],
    lateCancelReason: pickString(detailObj, ["late_canc_reason", "lateCancelReason"]),
  };
}

function findLocationByCrs(locations: HspLocation[], crs: string) {
  const upper = crs.toUpperCase();
  return locations.find((loc) => pickString(loc, ["location", "crs", "tpl"])?.toUpperCase() === upper) ?? null;
}

function getConfig() {
  const apiKey = process.env.HSP_API_KEY?.trim();
  const baseUrl =
    (
      process.env.HSP_BASE_URL?.trim() ||
      "https://api1.raildata.org.uk/1010-historical-service-performance-_hsp_v1/api/v1"
    ).replace(/\/+$/, "");
  if (!apiKey) {
    throw new HspCredentialsError("HSP credentials are missing. Set HSP_API_KEY.");
  }
  return { apiKey, baseUrl };
}

export async function serviceMetrics(query: HspServiceMetricsRequest) {
  const config = getConfig();
  return postJson(`${config.baseUrl}/serviceMetrics`, query, {
    "x-apikey": config.apiKey,
  });
}

export async function serviceDetails(rid: string) {
  const config = getConfig();
  return postJson(
    `${config.baseUrl}/serviceDetails`,
    { rid },
    { "x-apikey": config.apiKey }
  );
}

export async function fetchHspServices(params: HspServicesParams) {
  const requestedMins = hhmmToMins(params.time);
  if (requestedMins == null) throw new Error(`Invalid requested time '${params.time}' for HSP.`);

  const fromTime = minsToCompactHHMM(requestedMins - params.windowMins);
  const toTime = minsToCompactHHMM(requestedMins + params.windowMins);
  const dayType = deriveDayType(params.date);

  const metricsPayload = await serviceMetrics({
    from_loc: params.from.toUpperCase(),
    to_loc: params.to.toUpperCase(),
    from_time: fromTime,
    to_time: toTime,
    from_date: params.date,
    to_date: params.date,
    days: dayType,
  });

  const metrics = extractMetrics(metricsPayload);
  const baseServices: DarwinNormalizedService[] = metrics.map((metric, idx) => ({
    uid: `HSP:${metric.rid}`,
    operator: metric.tocCode,
    operatorName: metric.tocCode ?? "Unknown",
    platform: null,
    originName: params.from.toUpperCase(),
    destinationName: params.to.toUpperCase(),
    aimedDeparture: toHHMM(metric.gbttPtd),
    expectedDeparture: null,
    aimedArrival: "",
    expectedArrival: null,
    delayMins: null,
    status: "Unknown",
    callsAtTo: undefined,
    _timetableId: metric.rid ?? `hsp-${idx}`,
  }));

  const detailsLimit = Math.min(Math.max(params.detailsLimit ?? 5, 0), 10);
  const enriched = await Promise.all(
    baseServices.slice(0, detailsLimit).map(async (service) => {
      const rid = service.uid.startsWith("HSP:") ? service.uid.slice(4) : null;
      if (!rid) return null;
      try {
        const detailsPayload = await serviceDetails(rid);
        const details = parseServiceDetailsPayload(detailsPayload);
        const toLoc = findLocationByCrs(details.locations, params.to);
        const fromLoc = findLocationByCrs(details.locations, params.from);
        const cancelled =
          Boolean(details.lateCancelReason) ||
          Boolean(toLoc && pickString(toLoc, ["late_canc_reason", "lateCancelReason"]));

        const aimedArrival = toHHMM(toLoc ? pickString(toLoc, ["gbtt_pta"]) : null);
        const actualArrival = toHHMM(toLoc ? pickString(toLoc, ["actual_ta"]) : null);
        const aimedDeparture = toHHMM(fromLoc ? pickString(fromLoc, ["gbtt_ptd"]) : null);
        const actualDeparture = toHHMM(fromLoc ? pickString(fromLoc, ["actual_td"]) : null);
        const { delayMins, status } = deriveDelayAndStatus({
          cancelled,
          aimedArr: aimedArrival,
          expectedArr: actualArrival,
          aimedDep: aimedDeparture,
          expectedDep: actualDeparture,
        });
        return {
          uid: service.uid,
          aimedArrival: aimedArrival ?? "",
          expectedArrival: actualArrival,
          delayMins,
          status,
        };
      } catch {
        return null;
      }
    })
  );

  const byUid = new Map(
    enriched.filter((v): v is NonNullable<typeof v> => v !== null).map((entry) => [entry.uid, entry])
  );
  const services = baseServices.map((service) => {
    const detail = byUid.get(service.uid);
    if (!detail) return service;
    return {
      ...service,
      aimedArrival: detail.aimedArrival,
      expectedArrival: detail.expectedArrival,
      delayMins: detail.delayMins,
      status: detail.status,
    };
  });

  return {
    services,
    rawCount: metrics.length,
    query: {
      from_time: fromTime,
      to_time: toTime,
      days: dayType,
    },
  };
}

export async function fetchHspJourneys(params: HspServicesParams) {
  const requestedTime = toHHMM(params.time);
  if (!requestedTime) {
    throw new Error(`Invalid requested time '${params.time}' for HSP.`);
  }

  const base = await fetchHspServices({ ...params, detailsLimit: 0 });
  const preRanked = rankServicesForJourney(base.services, { time: requestedTime });
  const detailsLimit = Math.min(Math.max(params.detailsLimit ?? 8, 0), Math.max(preRanked.services.length, 0));
  const detailUidSet = new Set(preRanked.services.slice(0, detailsLimit).map((service) => service.uid));

  const enriched = await Promise.all(
    preRanked.services.map(async (service) => {
      if (!detailUidSet.has(service.uid)) {
        return service;
      }

      const rid = service.uid.startsWith("HSP:") ? service.uid.slice(4) : null;
      if (!rid) {
        return service;
      }

      try {
        const detailsPayload = await serviceDetails(rid);
        const details = parseServiceDetailsPayload(detailsPayload);
        const toLoc = findLocationByCrs(details.locations, params.to);
        const fromLoc = findLocationByCrs(details.locations, params.from);
        const cancelled =
          Boolean(details.lateCancelReason) ||
          Boolean(toLoc && pickString(toLoc, ["late_canc_reason", "lateCancelReason"]));
        const aimedArrival = toHHMM(toLoc ? pickString(toLoc, ["gbtt_pta"]) : null);
        const actualArrival = toHHMM(toLoc ? pickString(toLoc, ["actual_ta"]) : null);
        const aimedDeparture = toHHMM(fromLoc ? pickString(fromLoc, ["gbtt_ptd"]) : null);
        const actualDeparture = toHHMM(fromLoc ? pickString(fromLoc, ["actual_td"]) : null);
        const { delayMins, status } = deriveDelayAndStatus({
          cancelled,
          aimedArr: aimedArrival,
          expectedArr: actualArrival,
          aimedDep: aimedDeparture,
          expectedDep: actualDeparture,
        });

        return {
          ...service,
          aimedDeparture: aimedDeparture ?? service.aimedDeparture,
          expectedDeparture: actualDeparture,
          aimedArrival: aimedArrival ?? "",
          expectedArrival: actualArrival,
          delayMins,
          status,
          callsAtTo: toLoc ? true : undefined,
          rawStatusText: cancelled ? "Cancelled" : "Historical timing data",
        };
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[HSP] service details lookup failed", {
            rid,
            from: params.from,
            to: params.to,
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
        return service;
      }
    })
  );

  const matched = rankServicesForJourney(enriched, { time: requestedTime });
  const destinationConfirmedCount = enriched.filter((service) => service.callsAtTo === true).length;
  const destinationMismatchCount = enriched.filter((service) => service.callsAtTo === false).length;
  const destinationUnknownCount = enriched.filter((service) => service.callsAtTo == null).length;
  const diagnostics: DarwinMatchingDiagnostics = {
    requestedTime,
    windowMins: params.windowMins,
    rawServiceCount: base.rawCount,
    normalizedServiceCount: base.services.length,
    afterTimeWindowCount: base.services.length,
    afterDestinationFilterCount: base.services.length - destinationMismatchCount,
    candidateCount: base.services.length,
    excludedMissingFilterTime: 0,
    excludedOutsideWindow: 0,
    destinationConfirmedCount,
    destinationMismatchCount,
    destinationUnknownCount,
    normalizedServiceSample: enriched.slice(0, 3).map((service) => ({
      uid: service.uid,
      destinationName: service.destinationName,
      aimedDeparture: service.aimedDeparture,
      expectedDeparture: service.expectedDeparture,
      callsAtTo: service.callsAtTo ?? null,
    })),
    sampleExclusions: [],
  };

  if (process.env.NODE_ENV === "development") {
    console.log("[HSP] historical journey search", {
      from: params.from,
      to: params.to,
      date: params.date,
      requestedTime,
      windowMins: params.windowMins,
      rawServiceCount: base.rawCount,
      normalizedServiceCount: enriched.length,
      topCandidates: matched.services.slice(0, 3).map((service) => ({
        uid: service.uid,
        matchScore: service.matchScore ?? null,
        aimedDeparture: service.aimedDeparture,
        expectedDeparture: service.expectedDeparture,
        aimedArrival: service.aimedArrival,
        expectedArrival: service.expectedArrival,
        status: service.status,
      })),
    });
  }

  return {
    ...matched,
    diagnostics,
    source: "darwin.hsp",
    note:
      "Using Darwin HSP historical service performance data for a past-date search. Services are matched by route and ranked around the searched departure time.",
  };
}
