import { readFile } from "node:fs/promises";
import path from "node:path";

export type DarwinNormalizedService = {
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

export type DarwinFetchParams = {
  from?: string;
  to?: string;
  fromCrs?: string;
  toCrs?: string;
  date: string;
  time: string;
  windowMins?: number;
};

type DarwinServiceDetails = {
  rid: string;
  sta: string | null;
  eta: string | null;
  isCancelled: boolean;
  cancelReason: string | null;
};

function decodeXmlEntities(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseAttrs(text: string) {
  const attrs: Record<string, string> = {};
  for (const m of text.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
    const key = m[1];
    const value = m[2];
    attrs[key] = decodeXmlEntities(value);
  }
  return attrs;
}

function hhmmToMins(hhmm: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function toHHMM(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const text = v.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(text) ?? /T(\d{1,2}):(\d{2})/.exec(text);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
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

function pickTag(block: string, tags: string[]) {
  for (const tag of tags) {
    const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(block);
    if (m && typeof m[1] === "string") {
      const value = decodeXmlEntities(m[1]).trim();
      if (value.length > 0) return value;
    }
  }
  return null;
}

function isCancelledStatus(v: string | null | undefined) {
  const text = (v ?? "").toUpperCase();
  return text.includes("CANCEL") || text.includes("CANC") || text.includes("CANC/NR");
}

function normalizeExpected(raw: string | null, aimed: string | null) {
  if (!raw) return null;
  const text = raw.trim();
  if (/^on\s*time$/i.test(text)) return aimed;
  if (/^delayed$/i.test(text)) return null;
  if (isCancelledStatus(text)) return null;
  return toHHMM(text);
}

function deriveStatus(params: {
  rawStatus: string | null;
  isCancelled: boolean;
  delayMins: number | null;
}): DarwinNormalizedService["status"] {
  if (params.isCancelled || isCancelledStatus(params.rawStatus)) return "Cancelled";
  if (params.delayMins !== null) {
    if (params.delayMins > 0) return "Delayed";
    if (params.delayMins === 0) return "On time";
  }
  return "Unknown";
}

function getFixturePath(fileName: string) {
  return path.join(process.cwd(), "fixtures", "darwin", fileName);
}

async function readFixtureXml(fileName: string) {
  return readFile(getFixturePath(fileName), "utf8");
}

function parseServiceDetails(xml: string) {
  const map = new Map<string, DarwinServiceDetails>();
  for (const m of xml.matchAll(/<service\b([^>]*)>([\s\S]*?)<\/service>/gi)) {
    const attrs = parseAttrs(m[1] ?? "");
    const block = m[2] ?? "";
    const rid = attrs.rid ?? pickTag(block, ["rid"]);
    if (!rid) continue;
    const cancelValue = pickTag(block, ["isCancelled", "isCanceled"]);
    const isCancelled = cancelValue === "true" || cancelValue === "1";
    map.set(rid, {
      rid,
      sta: toHHMM(pickTag(block, ["sta", "scheduledArrival"])),
      eta: pickTag(block, ["eta", "expectedArrival"]),
      isCancelled,
      cancelReason: pickTag(block, ["cancelReasonCode", "cancelReason"]),
    });
  }
  return map;
}

function parseDepartures(params: {
  xml: string;
  detailsByRid: Map<string, DarwinServiceDetails>;
  fromCrs: string;
  toCrs: string;
}) {
  const services: DarwinNormalizedService[] = [];

  for (const m of params.xml.matchAll(/<service\b([^>]*)>([\s\S]*?)<\/service>/gi)) {
    const attrs = parseAttrs(m[1] ?? "");
    const block = m[2] ?? "";
    const rid = attrs.rid ?? pickTag(block, ["rid"]);
    const details = rid ? params.detailsByRid.get(rid) : undefined;

    const aimedDeparture = toHHMM(pickTag(block, ["std", "aimedDeparture", "scheduledDeparture"]));
    const rawEtd = pickTag(block, ["etd", "expectedDeparture", "liveDeparture"]);
    const expectedFromEtd = normalizeExpected(rawEtd, aimedDeparture);
    const detailsEta = normalizeExpected(details?.eta ?? null, details?.sta ?? null);
    const expectedDeparture = expectedFromEtd ?? detailsEta;

    const delayMins =
      aimedDeparture && expectedDeparture
        ? diffMins(aimedDeparture, expectedDeparture)
        : details?.sta && detailsEta
          ? diffMins(details.sta, detailsEta)
          : null;

    const rawStatus = [rawEtd, details?.cancelReason ?? null].filter((v) => typeof v === "string").join(" ");
    const status = deriveStatus({
      rawStatus,
      isCancelled: Boolean(details?.isCancelled),
      delayMins,
    });

    services.push({
      uid: attrs.uid ?? pickTag(block, ["uid", "serviceUid", "rid"]) ?? `darwin-${params.fromCrs}-${services.length}`,
      operator: pickTag(block, ["operatorCode", "toc"]) ?? null,
      operatorName: pickTag(block, ["operatorName", "operator"]) ?? "Unknown",
      platform: pickTag(block, ["platform"]),
      originName: pickTag(block, ["originName", "origin"]) ?? params.fromCrs,
      destinationName: pickTag(block, ["destinationName", "destination"]) ?? params.toCrs,
      aimedDeparture,
      expectedDeparture,
      delayMins,
      status,
      callsAtTo: undefined,
      _timetableId: rid ?? null,
    });
  }

  return services;
}

export async function fetchDarwinServices(params: DarwinFetchParams) {
  const fromCrs = params.fromCrs ?? params.from;
  const toCrs = params.toCrs ?? params.to;
  if (!fromCrs || !toCrs) {
    throw new Error("Darwin fetch requires fromCrs/toCrs (or from/to).");
  }

  const mode = (process.env.DARWIN_MODE ?? "off").trim().toLowerCase();
  if (mode !== "fixture") {
    throw new Error(`Darwin mode '${mode}' is not supported by the local adapter.`);
  }

  const [departuresXml, serviceDetailsXml] = await Promise.all([
    readFixtureXml("departures.xml"),
    readFixtureXml("service-details.xml"),
  ]);

  const detailsByRid = parseServiceDetails(serviceDetailsXml);
  const services = parseDepartures({
    xml: departuresXml,
    detailsByRid,
    fromCrs,
    toCrs,
  });

  return {
    services,
    rawCount: services.length,
  };
}
