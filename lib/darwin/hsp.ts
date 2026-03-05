import { buildBasicAuthHeader, postJson } from "@/lib/darwin/client";
import type {
  DarwinNormalizedService,
  HspDayType,
  HspServiceMetricsRequest,
  HspServicesParams,
} from "@/lib/darwin/types";
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

function pickString(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
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
  if (!colon) return null;
  const hh = Number(colon[1]);
  const mm = Number(colon[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function diffMins(aimed: string, actual: string) {
  const a = hhmmToMins(aimed);
  const b = hhmmToMins(actual);
  if (a == null || b == null) return null;
  let d = b - a;
  if (d < -720) d += 1440;
  if (d > 720) d -= 1440;
  return d;
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
    (Array.isArray(serviceLike.serviceAttributesMetrics) ? serviceLike.serviceAttributesMetrics[0] : null) ??
    (isRecord(serviceLike.serviceAttributesMetrics) ? serviceLike.serviceAttributesMetrics : null) ??
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
    (Array.isArray(payload.Services) ? payload.Services : null) ??
    (Array.isArray(payload.services) ? payload.services : null) ??
    (Array.isArray(payload.data) ? payload.data : null) ??
    [];
  return candidates
    .map((entry) => (isRecord(entry) ? toMetric(entry) : null))
    .filter((v): v is HspServiceMetric => v !== null);
}

function parseServiceDetailsPayload(payload: unknown): HspServiceDetails {
  const root = isRecord(payload) ? payload : {};
  const detailRoot =
    (Array.isArray(root.Services) ? root.Services[0] : null) ??
    (Array.isArray(root.services) ? root.services[0] : null) ??
    (isRecord(root.serviceDetails) ? root.serviceDetails : null) ??
    root;
  const detailObj = isRecord(detailRoot) ? detailRoot : {};
  return {
    locations: Array.isArray(detailObj.locations) ? detailObj.locations.filter(isRecord) : [],
    lateCancelReason: pickString(detailObj, ["late_canc_reason", "lateCancelReason"]),
  };
}

function findLocationByCrs(locations: HspLocation[], crs: string) {
  const upper = crs.toUpperCase();
  return locations.find((loc) => pickString(loc, ["location", "crs", "tpl"])?.toUpperCase() === upper) ?? null;
}

function getConfig() {
  const username = process.env.HSP_USERNAME?.trim();
  const password = process.env.HSP_PASSWORD?.trim();
  const baseUrl = (process.env.HSP_BASE_URL?.trim() || "https://hsp-prod.rockshore.net").replace(/\/+$/, "");
  if (!username || !password) {
    throw new HspCredentialsError("HSP credentials are missing. Set HSP_USERNAME and HSP_PASSWORD.");
  }
  return { username, password, baseUrl };
}

export async function serviceMetrics(query: HspServiceMetricsRequest) {
  const config = getConfig();
  return postJson(`${config.baseUrl}/api/v1/serviceMetrics`, query, {
    Authorization: buildBasicAuthHeader(config.username, config.password),
  });
}

export async function serviceDetails(rid: string) {
  const config = getConfig();
  return postJson(
    `${config.baseUrl}/api/v1/serviceDetails`,
    { rid },
    { Authorization: buildBasicAuthHeader(config.username, config.password) }
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
        if (cancelled) {
          return { uid: service.uid, delayMins: null, status: "Cancelled" as const };
        }

        const aimedArrival = toHHMM(toLoc ? pickString(toLoc, ["gbtt_pta"]) : null);
        const actualArrival = toHHMM(toLoc ? pickString(toLoc, ["actual_ta"]) : null);
        const aimedDeparture = toHHMM(fromLoc ? pickString(fromLoc, ["gbtt_ptd"]) : null);
        const actualDeparture = toHHMM(fromLoc ? pickString(fromLoc, ["actual_td"]) : null);
        const delay =
          aimedArrival && actualArrival
            ? diffMins(aimedArrival, actualArrival)
            : aimedDeparture && actualDeparture
              ? diffMins(aimedDeparture, actualDeparture)
              : null;
        return {
          uid: service.uid,
          delayMins: delay,
          status:
            delay === null ? ("Unknown" as const) : delay > 0 ? ("Delayed" as const) : ("On time" as const),
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
    return { ...service, delayMins: detail.delayMins, status: detail.status };
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
