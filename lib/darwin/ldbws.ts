import { DarwinHttpError, getJson } from "@/lib/darwin/client";
import { rankServicesForJourney } from "@/lib/darwin/match";
import type { DarwinMatchingDiagnostics, DarwinNormalizedService } from "@/lib/darwin/types";
import { deriveDelayAndStatus } from "@/lib/status/deriveDelayAndStatus";
import { isWithinWindow } from "@/lib/time/window";

type DarwinBoardParams = {
  from: string;
  to: string;
  date: string;
  time: string;
  windowMins: number;
};

type DarwinGatewayConfig = {
  apiKey: string;
  baseUrl: string;
};

type UnknownRecord = Record<string, unknown>;

const SERVICE_ID_KEYS = ["serviceID", "serviceId", "serviceid", "rid", "rsid", "uid"];
const OPERATOR_NAME_KEYS = ["operatorName", "operator", "tocName"];
const OPERATOR_CODE_KEYS = ["operatorCode", "atocCode", "tocCode"];
const ORIGIN_KEYS = ["origin"];
const DESTINATION_KEYS = ["destination"];
const PLATFORM_KEYS = ["platform", "platformNumber"];
const SCHEDULED_DEPARTURE_KEYS = ["std", "scheduledDeparture", "scheduledTimeDeparture"];
const EXPECTED_DEPARTURE_KEYS = ["atd", "etd", "expectedDeparture", "actualDeparture"];
const SCHEDULED_ARRIVAL_KEYS = ["sta", "scheduledArrival", "scheduledTimeArrival"];
const EXPECTED_ARRIVAL_KEYS = ["ata", "eta", "expectedArrival", "actualArrival"];
const CANCELLED_KEYS = ["isCancelled", "cancelled", "isCanceled", "canceled"];
const STATUS_KEYS = ["status", "serviceType", "generatedAt", "lastReport"];
const LOCATION_NAME_KEYS = ["locationName", "name", "description"];
const LOCATION_CRS_KEYS = ["crs", "crsCode", "locationCode"];

export class DarwinCredentialsError extends Error {
  constructor(message = "Darwin config is missing. Set DARWIN_API_KEY and DARWIN_BASE_URL.") {
    super(message);
    this.name = "DarwinCredentialsError";
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findValue(record: UnknownRecord, keys: string[]) {
  const wanted = new Set(keys.map(normalizeKey));
  for (const [key, value] of Object.entries(record)) {
    if (wanted.has(normalizeKey(key))) return value;
  }
  return undefined;
}

function pickString(record: UnknownRecord, keys: string[]) {
  const value = findValue(record, keys);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function pickBoolean(record: UnknownRecord, keys: string[]) {
  const value = findValue(record, keys);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (/^true$/i.test(value.trim())) return true;
    if (/^false$/i.test(value.trim())) return false;
  }
  return null;
}

function pickNode(record: UnknownRecord, keys: string[]) {
  return findValue(record, keys);
}

function findFirstStringDeep(node: unknown, keys: string[], seen = new Set<unknown>()): string | null {
  if (typeof node === "string" && keys.length === 0) {
    return node.trim().length > 0 ? node.trim() : null;
  }
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

function extractLocationName(node: unknown) {
  return findFirstStringDeep(node, LOCATION_NAME_KEYS);
}

function extractLocationCrs(node: unknown) {
  const crs = findFirstStringDeep(node, LOCATION_CRS_KEYS);
  return crs ? crs.toUpperCase() : null;
}

function looksLikeService(record: UnknownRecord) {
  return Boolean(
    pickString(record, SERVICE_ID_KEYS) ||
      pickString(record, SCHEDULED_DEPARTURE_KEYS) ||
      pickString(record, EXPECTED_DEPARTURE_KEYS) ||
      pickString(record, SCHEDULED_ARRIVAL_KEYS) ||
      pickString(record, EXPECTED_ARRIVAL_KEYS),
  );
}

function collectServiceRecords(node: unknown, seen = new Set<unknown>(), services: UnknownRecord[] = []) {
  if (!isRecord(node) && !Array.isArray(node)) return services;
  if (seen.has(node)) return services;
  seen.add(node);

  if (Array.isArray(node)) {
    for (const entry of node) {
      collectServiceRecords(entry, seen, services);
    }
    return services;
  }

  if (looksLikeService(node)) {
    services.push(node);
    return services;
  }

  for (const value of Object.values(node)) {
    collectServiceRecords(value, seen, services);
  }
  return services;
}

function toHHMM(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const compact = /^(\d{2})(\d{2})$/.exec(text);
  if (compact) return `${compact[1]}:${compact[2]}`;
  const colon = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!colon) return null;
  const hh = Number(colon[1]);
  const mm = Number(colon[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function normalizeRealtimeTime(raw: string | null, fallback: string | null) {
  if (!raw) return null;
  if (/^on time$/i.test(raw)) return fallback;
  if (/^cancel/i.test(raw) || /^canc/i.test(raw)) return null;
  return toHHMM(raw);
}

function buildRawStatusText(parts: Array<string | null>) {
  const text = parts
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join(" | ");
  return text.length > 0 ? text : null;
}

function serviceFilterTime(service: DarwinNormalizedService) {
  return service.expectedDeparture ?? service.aimedDeparture;
}

function buildMatchingDiagnostics(
  services: DarwinNormalizedService[],
  requestedTime: string,
  windowMins: number,
  rawServiceCount: number,
): DarwinMatchingDiagnostics {
  const sampleExclusions: DarwinMatchingDiagnostics["sampleExclusions"] = [];
  const normalizedServiceSample = services.slice(0, 3).map((service) => ({
    uid: service.uid,
    destinationName: service.destinationName,
    aimedDeparture: service.aimedDeparture,
    expectedDeparture: service.expectedDeparture,
    callsAtTo: service.callsAtTo ?? null,
  }));
  let excludedMissingFilterTime = 0;
  let excludedOutsideWindow = 0;
  let candidateCount = 0;
  let destinationConfirmedCount = 0;
  let destinationMismatchCount = 0;
  let destinationUnknownCount = 0;

  for (const service of services) {
    const filterTime = serviceFilterTime(service);
    if (!filterTime) {
      excludedMissingFilterTime += 1;
      if (sampleExclusions.length < 5) {
        sampleExclusions.push({
          uid: service.uid,
          reason: "missing_filter_time",
          filterTime: null,
          callsAtTo: service.callsAtTo ?? null,
          destinationName: service.destinationName,
        });
      }
      continue;
    }

    if (!isWithinWindow(filterTime, requestedTime, windowMins)) {
      excludedOutsideWindow += 1;
      if (sampleExclusions.length < 5) {
        sampleExclusions.push({
          uid: service.uid,
          reason: "outside_window",
          filterTime,
          callsAtTo: service.callsAtTo ?? null,
          destinationName: service.destinationName,
        });
      }
      continue;
    }

    candidateCount += 1;
    if (service.callsAtTo === true) {
      destinationConfirmedCount += 1;
    } else if (service.callsAtTo === false) {
      destinationMismatchCount += 1;
    } else {
      destinationUnknownCount += 1;
    }
  }

  return {
    requestedTime,
    windowMins,
    rawServiceCount,
    normalizedServiceCount: services.length,
    afterTimeWindowCount: candidateCount,
    // MVP rule: only confidently wrong services would be excluded by destination.
    afterDestinationFilterCount: candidateCount - destinationMismatchCount,
    candidateCount,
    excludedMissingFilterTime,
    excludedOutsideWindow,
    destinationConfirmedCount,
    destinationMismatchCount,
    destinationUnknownCount,
    normalizedServiceSample,
    sampleExclusions,
  };
}

function getConfig(): DarwinGatewayConfig {
  const apiKey = process.env.DARWIN_API_KEY?.trim();
  const baseUrl = process.env.DARWIN_BASE_URL?.trim();
  if (!apiKey || !baseUrl) {
    throw new DarwinCredentialsError();
  }
  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
  };
}

function getBoardUrl(config: DarwinGatewayConfig, crs: string) {
  return `${config.baseUrl}/GetArrDepBoardWithDetails/${encodeURIComponent(crs.toUpperCase())}`;
}

function normalizeService(service: UnknownRecord, params: DarwinBoardParams, index: number): DarwinNormalizedService {
  const serviceId = pickString(service, SERVICE_ID_KEYS);
  const scheduledDeparture = toHHMM(pickString(service, SCHEDULED_DEPARTURE_KEYS));
  const realtimeDepartureRaw = pickString(service, EXPECTED_DEPARTURE_KEYS);
  const scheduledArrival = toHHMM(pickString(service, SCHEDULED_ARRIVAL_KEYS)) ?? "";
  const realtimeArrivalRaw = pickString(service, EXPECTED_ARRIVAL_KEYS);
  const expectedDeparture = normalizeRealtimeTime(realtimeDepartureRaw, scheduledDeparture);
  const expectedArrival = normalizeRealtimeTime(realtimeArrivalRaw, scheduledArrival || null);
  const cancelled =
    pickBoolean(service, CANCELLED_KEYS) === true ||
    Boolean(realtimeDepartureRaw && /^cancel/i.test(realtimeDepartureRaw)) ||
    Boolean(realtimeArrivalRaw && /^cancel/i.test(realtimeArrivalRaw));

  let { delayMins, status } = deriveDelayAndStatus({
    cancelled,
    aimedArr: scheduledArrival || null,
    expectedArr: expectedArrival,
    aimedDep: scheduledDeparture,
    expectedDep: expectedDeparture,
  });

  if (status === "Unknown" && (realtimeDepartureRaw || realtimeArrivalRaw)) {
    if (/^on time$/i.test(realtimeDepartureRaw ?? "") || /^on time$/i.test(realtimeArrivalRaw ?? "")) {
      status = "On time";
      delayMins = 0;
    } else if (/^delayed$/i.test(realtimeDepartureRaw ?? "") || /^delayed$/i.test(realtimeArrivalRaw ?? "")) {
      status = "Delayed";
    }
  }

  const originNode = pickNode(service, ORIGIN_KEYS);
  const destinationNode = pickNode(service, DESTINATION_KEYS);
  const destinationCrs = extractLocationCrs(destinationNode);
  const toCrs = params.to.toUpperCase();
  const callsAtTo = destinationCrs ? destinationCrs === toCrs : undefined;

  return {
    uid: `DARWIN:${serviceId ?? `${params.from.toUpperCase()}-${index}`}`,
    operator: pickString(service, OPERATOR_CODE_KEYS),
    operatorName: pickString(service, OPERATOR_NAME_KEYS) ?? "Unknown",
    platform: pickString(service, PLATFORM_KEYS),
    originName: extractLocationName(originNode) ?? params.from.toUpperCase(),
    destinationName: extractLocationName(destinationNode) ?? params.to.toUpperCase(),
    aimedDeparture: scheduledDeparture,
    expectedDeparture,
    aimedArrival: scheduledArrival,
    expectedArrival,
    delayMins,
    status,
    callsAtTo,
    rawStatusText: buildRawStatusText([
      realtimeDepartureRaw,
      realtimeArrivalRaw,
      pickString(service, STATUS_KEYS),
    ]),
    _timetableId: serviceId,
  };
}

export async function fetchDarwinDepartureBoard(params: DarwinBoardParams) {
  const config = getConfig();
  const url = getBoardUrl(config, params.from);

  let payload: unknown;
  try {
    payload = await getJson(url, {
      // The Rail Data gateway expects the API key in the exact header name "x-apikey".
      "x-apikey": config.apiKey,
    });
  } catch (error) {
    if (error instanceof DarwinHttpError) {
      console.error("[Darwin] board request failed", {
        from: params.from,
        to: params.to,
        status: error.status,
        preview: error.bodyPreview,
      });
    } else {
      console.error("[Darwin] board request failed", {
        from: params.from,
        to: params.to,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
    throw error;
  }

  const rawServices = collectServiceRecords(payload);
  const normalizedServices = rawServices.map((service, index) => normalizeService(service, params, index));
  const diagnostics = buildMatchingDiagnostics(
    normalizedServices,
    params.time,
    params.windowMins,
    rawServices.length,
  );
  const services = normalizedServices.filter((service) => {
    const filterTime = serviceFilterTime(service);
    if (!filterTime) return false;
    return isWithinWindow(filterTime, params.time, params.windowMins);
  });

  const matched = rankServicesForJourney(services, { time: params.time });

  if (process.env.NODE_ENV === "development") {
    console.log("[Darwin] live board matching", {
      from: params.from,
      to: params.to,
      requestedTime: params.time,
      windowMins: params.windowMins,
      rawServiceCount: diagnostics.rawServiceCount,
      normalizedServiceCount: diagnostics.normalizedServiceCount,
      afterTimeWindowCount: diagnostics.afterTimeWindowCount,
      afterDestinationFilterCount: diagnostics.afterDestinationFilterCount,
      normalizedServiceSample: diagnostics.normalizedServiceSample,
      sampleExclusions: diagnostics.sampleExclusions,
      topCandidates: matched.services.slice(0, 3).map((service) => ({
        uid: service.uid,
        matchScore: service.matchScore ?? null,
        destinationName: service.destinationName,
        callsAtTo: service.callsAtTo ?? null,
        aimedDeparture: service.aimedDeparture,
        expectedDeparture: service.expectedDeparture,
        status: service.status,
      })),
      diagnostics,
    });
  }

  return {
    ...matched,
    diagnostics,
    source: "darwin.gateway",
    note:
      "Using Darwin live Arr/Dep board data from the Rail Data gateway. Services are filtered by departure window and ranked by destination signal plus departure-time proximity.",
  };
}
