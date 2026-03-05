type HspDayType = "WEEKDAY" | "SATURDAY" | "SUNDAY";

export type HspJourneyService = {
  uid: string;
  operator: string | null;
  operatorName: string;
  platform: string | null;
  originName: string;
  destinationName: string;
  aimedDeparture: string | null;
  expectedDeparture: string | null;
  delayMins: number | null;
  status: "On time" | "Delayed" | "Cancelled" | "Unknown";
  callsAtTo?: boolean;
  _timetableId?: string | null;
};

export type HspServicesParams = {
  from: string;
  to: string;
  date: string;
  time: string;
  windowMins: number;
  detailsLimit?: number;
};

type HspServiceMetric = {
  rid: string;
  tocCode: string | null;
  gbttPtd: string | null;
  gbttPta: string | null;
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
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
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

function clampMins(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1439) return 1439;
  return Math.floor(value);
}

function hhmmToMins(hhmm: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return hh * 60 + mm;
}

function minsToHspHHMM(totalMins: number) {
  const clamped = clampMins(totalMins);
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(hh).padStart(2, "0")}${String(mm).padStart(2, "0")}`;
}

function toHHMM(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const text = v.trim();
  const compact = /^(\d{2})(\d{2})$/.exec(text);
  if (compact) {
    const hh = Number(compact[1]);
    const mm = Number(compact[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return `${compact[1]}:${compact[2]}`;
    return null;
  }
  const colon = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!colon) return null;
  const hh = Number(colon[1]);
  const mm = Number(colon[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function diffMins(aimed: string, expected: string) {
  const a = hhmmToMins(aimed);
  const e = hhmmToMins(expected);
  if (a == null || e == null) return null;
  let d = e - a;
  if (d < -720) d += 1440;
  if (d > 720) d -= 1440;
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
    gbttPta: pickString(metricObject, ["gbtt_pta", "gbttPta"]),
  };
}

function extractMetrics(payload: unknown) {
  if (!isRecord(payload)) return [];
  const serviceCandidates =
    (Array.isArray(payload.Services) ? payload.Services : null) ??
    (Array.isArray(payload.services) ? payload.services : null) ??
    (Array.isArray(payload.data) ? payload.data : null) ??
    [];
  return serviceCandidates
    .map((entry) => (isRecord(entry) ? toMetric(entry) : null))
    .filter((v): v is HspServiceMetric => v !== null);
}

function parseHspDetails(payload: unknown): HspServiceDetails {
  const root = isRecord(payload) ? payload : {};
  const detailRoot =
    (Array.isArray(root.Services) ? root.Services[0] : null) ??
    (Array.isArray(root.services) ? root.services[0] : null) ??
    (isRecord(root.serviceDetails) ? root.serviceDetails : null) ??
    root;
  const obj = isRecord(detailRoot) ? detailRoot : {};
  const locations = Array.isArray(obj.locations) ? obj.locations.filter(isRecord) : [];

  return {
    locations,
    lateCancelReason: pickString(obj, ["late_canc_reason", "lateCancelReason"]),
  };
}

function findLocationByCrs(locations: HspLocation[], crs: string) {
  const upper = crs.toUpperCase();
  return (
    locations.find((loc) => pickString(loc, ["location", "crs", "tpl"])?.toUpperCase() === upper) ??
    null
  );
}

function isCancelledFromDetails(details: HspServiceDetails, location: HspLocation | null) {
  if (details.lateCancelReason) return true;
  if (!location) return false;
  return Boolean(pickString(location, ["late_canc_reason", "lateCancelReason"]));
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

export function buildBasicAuthHeader(user: string, pass: string) {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

export async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>
): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const raw = await res.text();
  let parsed: unknown = null;
  try {
    parsed = raw.length > 0 ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const preview = typeof parsed === "object" && parsed !== null ? JSON.stringify(parsed).slice(0, 300) : raw.slice(0, 300);
    throw new Error(`HSP request failed (${res.status}): ${preview}`);
  }
  return parsed;
}

export async function serviceMetrics(query: {
  from_loc: string;
  to_loc: string;
  from_time: string;
  to_time: string;
  from_date: string;
  to_date: string;
  days: HspDayType;
  toc_filter?: string;
  tolerance?: number;
}) {
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
    {
      Authorization: buildBasicAuthHeader(config.username, config.password),
    }
  );
}

export async function fetchHspServices(params: HspServicesParams) {
  const requestedMins = hhmmToMins(params.time);
  if (requestedMins == null) {
    throw new Error(`Invalid requested time '${params.time}' for HSP query.`);
  }

  const fromTime = minsToHspHHMM(requestedMins - params.windowMins);
  const toTime = minsToHspHHMM(requestedMins + params.windowMins);
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
  const baseServices: HspJourneyService[] = metrics.map((metric, idx) => ({
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
  const withDetails = await Promise.all(
    baseServices.slice(0, detailsLimit).map(async (service) => {
      const rid = service.uid.startsWith("HSP:") ? service.uid.slice(4) : null;
      if (!rid) return null;
      try {
        const detailsPayload = await serviceDetails(rid);
        const details = parseHspDetails(detailsPayload);
        const toLoc = findLocationByCrs(details.locations, params.to);
        const fromLoc = findLocationByCrs(details.locations, params.from);
        const cancelled = isCancelledFromDetails(details, toLoc ?? fromLoc);

        if (cancelled) {
          return { uid: service.uid, status: "Cancelled" as const, delayMins: null };
        }

        const aimedArr = toHHMM(toLoc ? pickString(toLoc, ["gbtt_pta"]) : null);
        const actualArr = toHHMM(toLoc ? pickString(toLoc, ["actual_ta"]) : null);
        const aimedDep = toHHMM(fromLoc ? pickString(fromLoc, ["gbtt_ptd"]) : null);
        const actualDep = toHHMM(fromLoc ? pickString(fromLoc, ["actual_td"]) : null);

        const delay =
          aimedArr && actualArr
            ? diffMins(aimedArr, actualArr)
            : aimedDep && actualDep
              ? diffMins(aimedDep, actualDep)
              : null;
        if (delay === null) return { uid: service.uid, status: "Unknown" as const, delayMins: null };
        return {
          uid: service.uid,
          delayMins: delay,
          status: delay > 0 ? ("Delayed" as const) : ("On time" as const),
        };
      } catch {
        return null;
      }
    })
  );

  const byUid = new Map(withDetails.filter((v): v is NonNullable<typeof v> => v !== null).map((v) => [v.uid, v]));
  const services = baseServices.map((service) => {
    const detail = byUid.get(service.uid);
    if (!detail) return service;
    return {
      ...service,
      status: detail.status,
      delayMins: detail.delayMins,
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
