import { DarwinHttpError, DarwinTimeoutError, postJson } from "@/lib/darwin/client";
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

type HspServiceDetailSummary = {
  aimedDeparture: string | null;
  expectedDeparture: string | null;
  aimedArrival: string | "";
  expectedArrival: string | null;
  delayMins: number | null;
  status: DarwinNormalizedService["status"];
  statusBasis?: DarwinNormalizedService["statusBasis"];
  callsAtTo?: boolean;
  rawStatusText?: string | null;
};

const DEFAULT_HSP_SERVICE_METRICS_TIMEOUT_MS = 12000;
const HSP_SERVICE_DETAILS_TIMEOUT_MS = 12000;
const DEFAULT_HSP_429_RETRY_DELAY_MS = 1000;
const HSP_429_MAX_RETRIES = 1;
const HSP_DEBUG_TIMING_ENABLED =
  process.env.HSP_DEBUG_TIMING === "1" || process.env.NODE_ENV === "development";

function parseTimeoutMs(value: string | undefined, fallback: number) {
  const parsed = Number(value?.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

const HSP_SERVICE_METRICS_TIMEOUT_MS = parseTimeoutMs(
  process.env.HSP_METRICS_TIMEOUT_MS,
  DEFAULT_HSP_SERVICE_METRICS_TIMEOUT_MS,
);
const HSP_429_RETRY_DELAY_MS = parseTimeoutMs(
  process.env.HSP_429_RETRY_DELAY_MS,
  DEFAULT_HSP_429_RETRY_DELAY_MS,
);

export class HspCredentialsError extends Error {
  constructor(message = "Missing HSP credentials.") {
    super(message);
    this.name = "HspCredentialsError";
  }
}

function hspDebugLog(event: string, payload: Record<string, unknown>) {
  if (!HSP_DEBUG_TIMING_ENABLED) return;
  console.info(`[HSP] ${event}`, payload);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHspRateLimited(error: unknown): error is DarwinHttpError {
  return error instanceof DarwinHttpError && error.status === 429;
}

function getHsp429RetryDelayMs(attempt: number) {
  const jitterMultiplier = 0.75 + Math.random() * 0.5;
  return Math.max(1, Math.floor(HSP_429_RETRY_DELAY_MS * attempt * jitterMultiplier));
}

async function withHsp429Retry<T>(
  operation: string,
  context: Record<string, unknown>,
  run: () => Promise<T>,
): Promise<T> {
  let attempt = 0;

  for (;;) {
    try {
      return await run();
    } catch (error) {
      if (!isHspRateLimited(error)) {
        throw error;
      }

      if (attempt >= HSP_429_MAX_RETRIES) {
        hspDebugLog(`${operation} rate limited; giving up`, {
          ...context,
          attempts: attempt + 1,
        });
        throw error;
      }

      attempt += 1;
      const retryDelayMs = getHsp429RetryDelayMs(attempt);
      hspDebugLog(`${operation} rate limited; retrying`, {
        ...context,
        attempt,
        retryDelayMs,
      });
      await sleep(retryDelayMs);
    }
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

function findFirstStringDeep(node: unknown, keys: string[], seen = new Set<unknown>()): string | null {
  if (!isRecord(node) && !Array.isArray(node)) return null;
  if (seen.has(node)) return null;
  seen.add(node);

  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findFirstStringDeep(entry, keys, seen);
      if (found) return found;
    }
    return null;
  }

  const direct = pickString(node, keys);
  if (direct) return direct;

  for (const value of Object.values(node)) {
    const found = findFirstStringDeep(value, keys, seen);
    if (found) return found;
  }
  return null;
}

function collectRecordsDeep(
  node: unknown,
  predicate: (record: Record<string, unknown>) => boolean,
  seen = new Set<unknown>(),
  matches: Record<string, unknown>[] = [],
) {
  if (!isRecord(node) && !Array.isArray(node)) return matches;
  if (seen.has(node)) return matches;
  seen.add(node);

  if (Array.isArray(node)) {
    for (const entry of node) {
      collectRecordsDeep(entry, predicate, seen, matches);
    }
    return matches;
  }

  if (predicate(node)) {
    matches.push(node);
    return matches;
  }

  for (const value of Object.values(node)) {
    collectRecordsDeep(value, predicate, seen, matches);
  }
  return matches;
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

function looksLikeHspLocation(record: Record<string, unknown>) {
  return Boolean(
    pickString(record, [
      "location",
      "crs",
      "tpl",
      "crs_code",
      "location_code",
      "stanox",
      "gbtt_ptd",
      "gbtt_pta",
      "actual_td",
      "actual_ta",
    ]),
  );
}

function parseServiceDetailsPayload(payload: unknown): HspServiceDetails {
  const root = isRecord(payload) ? payload : {};
  const detailRoot =
    pickRecordArray(root, ["Services", "services", "serviceDetails"])?.[0] ??
    pickRecordArray(root, ["serviceAttributesDetails", "serviceAttributeDetails"])?.[0] ??
    pickRecord(root, ["serviceDetails"]) ??
    pickRecord(root, ["serviceAttributesDetails", "serviceAttributeDetails"]) ??
    root;
  const detailObj = isRecord(detailRoot) ? detailRoot : {};
  const locations =
    pickRecordArray(detailObj, ["locations", "location"]) ??
    pickRecordArray(root, ["locations", "location"]) ??
    collectRecordsDeep(detailObj, looksLikeHspLocation);

  return {
    locations,
    lateCancelReason:
      pickString(detailObj, ["late_canc_reason", "lateCancelReason"]) ??
      findFirstStringDeep(detailObj, ["late_canc_reason", "lateCancelReason", "cancelReason", "cancelReasonCode"]),
  };
}

function findLocationByCrs(locations: HspLocation[], crs: string) {
  const upper = crs.toUpperCase();
  return (
    locations.find((loc) =>
      [
        findFirstStringDeep(loc, ["location", "crs", "tpl", "crs_code", "location_code"]),
        findFirstStringDeep(loc, ["locationName", "name"]),
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toUpperCase() === upper),
    ) ?? null
  );
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
  const startedAt = Date.now();
  try {
    const payload = await withHsp429Retry(
      "serviceMetrics",
      {
        from: query.from_loc,
        to: query.to_loc,
        fromDate: query.from_date,
        toDate: query.to_date,
        fromTime: query.from_time,
        toTime: query.to_time,
        days: query.days,
      },
      () =>
        postJson(
          `${config.baseUrl}/serviceMetrics`,
          query,
          {
            "x-apikey": config.apiKey,
          },
          { timeoutMs: HSP_SERVICE_METRICS_TIMEOUT_MS },
        ),
    );
    hspDebugLog("serviceMetrics response", {
      durationMs: Date.now() - startedAt,
      from: query.from_loc,
      to: query.to_loc,
      fromDate: query.from_date,
      toDate: query.to_date,
      fromTime: query.from_time,
      toTime: query.to_time,
      days: query.days,
      timeoutMs: HSP_SERVICE_METRICS_TIMEOUT_MS,
    });
    return payload;
  } catch (error) {
    hspDebugLog("serviceMetrics failed", {
      durationMs: Date.now() - startedAt,
      from: query.from_loc,
      to: query.to_loc,
      fromDate: query.from_date,
      toDate: query.to_date,
      fromTime: query.from_time,
      toTime: query.to_time,
      days: query.days,
      timeoutMs: HSP_SERVICE_METRICS_TIMEOUT_MS,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function serviceDetails(rid: string, timeoutMs?: number) {
  const config = getConfig();
  return withHsp429Retry(
    "serviceDetails",
    { rid, timeoutMs: timeoutMs ?? null },
    () =>
      postJson(
        `${config.baseUrl}/serviceDetails`,
        { rid },
        { "x-apikey": config.apiKey },
        timeoutMs ? { timeoutMs } : {},
      ),
  );
}

async function loadHspServiceDetailSummary(
  rid: string,
  params: Pick<HspServicesParams, "from" | "to">,
  timeoutMs = HSP_SERVICE_DETAILS_TIMEOUT_MS,
): Promise<HspServiceDetailSummary> {
  hspDebugLog("serviceDetails requested", {
    rid,
    from: params.from,
    to: params.to,
    timeoutMs,
  });

  const startedAt = Date.now();
  const detailsPayload = await serviceDetails(rid, timeoutMs);
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
  const { delayMins, status, basis } = deriveDelayAndStatus({
    cancelled,
    aimedArr: aimedArrival,
    expectedArr: actualArrival,
    aimedDep: aimedDeparture,
    expectedDep: actualDeparture,
  });

  hspDebugLog("serviceDetails succeeded", {
    rid,
    from: params.from,
    to: params.to,
    durationMs: Date.now() - startedAt,
    locationCount: details.locations.length,
    callsAtTo: toLoc ? true : details.locations.length > 0 ? false : undefined,
    aimedDeparture,
    actualDeparture,
    aimedArrival,
    actualArrival,
    status,
    delayMins,
  });

  return {
    aimedDeparture,
    expectedDeparture: actualDeparture,
    aimedArrival: aimedArrival ?? "",
    expectedArrival: actualArrival,
    delayMins,
    status,
    statusBasis: basis === "cancelled" ? "raw_status" : basis,
    callsAtTo: toLoc ? true : details.locations.length > 0 ? false : undefined,
    rawStatusText: cancelled ? "Cancelled" : "Historical timing data",
  };
}

function buildBaseHspServices(metrics: HspServiceMetric[], params: HspServicesParams): DarwinNormalizedService[] {
  return metrics.map((metric, idx) => ({
    uid: `HSP:${metric.rid}`,
    operator: metric.tocCode,
    operatorName: metric.tocCode ?? "Unknown",
    claimUrl: null,
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
}

export async function enrichHspService(
  service: DarwinNormalizedService,
  params: Pick<HspServicesParams, "from" | "to">,
) {
  const rid = service.uid.startsWith("HSP:") ? service.uid.slice(4) : null;
  if (!rid) {
    return service;
  }

  try {
    const detail = await loadHspServiceDetailSummary(rid, params);

    return {
      ...service,
      aimedDeparture: detail.aimedDeparture ?? service.aimedDeparture,
      expectedDeparture: detail.expectedDeparture,
      aimedArrival: detail.aimedArrival,
      expectedArrival: detail.expectedArrival,
      delayMins: detail.delayMins,
      status: detail.status,
      statusBasis: detail.statusBasis,
      callsAtTo: detail.callsAtTo,
      rawStatusText: detail.rawStatusText,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (process.env.NODE_ENV === "development") {
      if (error instanceof DarwinTimeoutError) {
        console.warn("[HSP] serviceDetails timed out", {
          rid,
          from: params.from,
          to: params.to,
          timeoutMs: HSP_SERVICE_DETAILS_TIMEOUT_MS,
        });
      } else {
        console.warn("[HSP] serviceDetails failed", {
          rid,
          from: params.from,
          to: params.to,
          message,
        });
      }
      console.info("[HSP] falling back to base service", {
        rid,
        uid: service.uid,
        from: params.from,
        to: params.to,
      });
    }
    return service;
  }
}

export async function fetchHspServices(params: HspServicesParams) {
  const requestedMins = hhmmToMins(params.time);
  if (requestedMins == null) throw new Error(`Invalid requested time '${params.time}' for HSP.`);

  const fromTime = minsToCompactHHMM(requestedMins - params.windowMins);
  const toTime = minsToCompactHHMM(requestedMins + params.windowMins);
  const dayType = deriveDayType(params.date);
  const startedAt = Date.now();

  hspDebugLog("fetchHspServices started", {
    from: params.from,
    to: params.to,
    date: params.date,
    requestedTime: params.time,
    windowMins: params.windowMins,
    fromTime,
    toTime,
    dayType,
  });

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
  hspDebugLog("serviceMetrics parsed", {
    from: params.from,
    to: params.to,
    date: params.date,
    requestedTime: params.time,
    rawServiceCount: metrics.length,
  });
  const services = buildBaseHspServices(metrics, params);

  hspDebugLog("fetchHspServices completed", {
    from: params.from,
    to: params.to,
    date: params.date,
    requestedTime: params.time,
    durationMs: Date.now() - startedAt,
    rawServiceCount: metrics.length,
    candidateServiceCount: services.length,
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

  const startedAt = Date.now();
  hspDebugLog("historical journey search started", {
    from: params.from,
    to: params.to,
    date: params.date,
    requestedTime,
    windowMins: params.windowMins,
  });

  const base = await fetchHspServices(params);
  const matched = rankServicesForJourney(base.services, { time: requestedTime });
  const destinationConfirmedCount = matched.services.filter((service) => service.callsAtTo === true).length;
  const destinationMismatchCount = matched.services.filter((service) => service.callsAtTo === false).length;
  const destinationUnknownCount = matched.services.filter((service) => service.callsAtTo == null).length;
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
    normalizedServiceSample: matched.services.slice(0, 3).map((service) => ({
      uid: service.uid,
      destinationName: service.destinationName,
      aimedDeparture: service.aimedDeparture,
      expectedDeparture: service.expectedDeparture,
      callsAtTo: service.callsAtTo ?? null,
    })),
    sampleExclusions: [],
  };

  hspDebugLog("historical journey search completed", {
    from: params.from,
    to: params.to,
    date: params.date,
    requestedTime,
    windowMins: params.windowMins,
    durationMs: Date.now() - startedAt,
    rawServiceCount: base.rawCount,
    normalizedServiceCount: matched.services.length,
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

  return {
    ...matched,
    diagnostics,
    source: "darwin.hsp",
    note:
      "Using Darwin HSP historical service performance metrics for a past-date search. Candidate services are matched by route and ranked around the searched departure time.",
  };
}
