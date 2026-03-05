import { fetchDarwinFixtureServices } from "@/lib/darwin/fixture";
import { fetchHspServices, HspCredentialsError } from "@/lib/darwin/hsp";
import { deriveStatus } from "@/lib/status/deriveStatus";
import { addMinutes, hhmmToMins } from "@/lib/time/hhmm";
import { absDeltaMins, isWithinWindow } from "@/lib/time/window";
import type { DarwinNormalizedService } from "@/lib/darwin/types";

export type JourneyProviderQuery = {
  from: string;
  to: string;
  date: string;
  time: string;
  windowMins: number;
  filterDest: boolean;
};

export type JourneyProviderResult = {
  services: DarwinNormalizedService[];
  source: string;
  note: string;
};

export class JourneyProviderError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "JourneyProviderError";
    this.status = status;
  }
}

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new JourneyProviderError(`Missing env var: ${name}`, 502);
  return v;
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

function getTodayISO(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toHHMM(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const text = v.trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(text) ?? /T(\d{1,2}):(\d{2})/.exec(text);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickString(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function extractDepartureRows(dataObj: Record<string, unknown>) {
  const departures = isRecord(dataObj.departures) ? dataObj.departures : null;
  if (departures && Array.isArray(departures.all)) return departures.all;
  if (Array.isArray(dataObj.departures)) return dataObj.departures;
  if (Array.isArray(dataObj.services)) return dataObj.services;
  return [];
}

function serviceFilterTime(service: { expectedDeparture: string | null; aimedDeparture: string | null }) {
  return toHHMM(service.expectedDeparture) ?? toHHMM(service.aimedDeparture);
}

function chooseSource(params: { date: string; now?: Date }) {
  const now = params.now ?? new Date();
  const todayISO = getTodayISO(now);
  return params.date === todayISO ? ("live" as const) : ("timetable" as const);
}

async function fetchTransportApiServices(params: JourneyProviderQuery) {
  if (process.env.TRANSPORT_API_ENABLED !== "1") {
    throw new JourneyProviderError(
      "TransportAPI provider is disabled. Set TRANSPORT_API_ENABLED=1 to enable it.",
      502
    );
  }

  const APP_ID = requireEnv("TRANSPORT_API_ID");
  const APP_KEY = requireEnv("TRANSPORT_API_KEY");
  const selectedSource = chooseSource({ date: params.date });
  const source =
    selectedSource === "live" ? "transportapi.station_live" : "transportapi.station_timetable";
  const sourceReason =
    selectedSource === "live"
      ? "Using station live feed because requested date matches server-local today."
      : "Using station timetable feed because requested date is not server-local today.";
  const url =
    selectedSource === "live"
      ? new URL(`https://transportapi.com/v3/uk/train/station/${encodeURIComponent(params.from)}/live.json`)
      : new URL(
          `https://transportapi.com/v3/uk/train/station/${encodeURIComponent(params.from)}/${encodeURIComponent(params.date)}/${encodeURIComponent(params.time)}/timetable.json`
        );
  url.searchParams.set("app_id", APP_ID);
  url.searchParams.set("app_key", APP_KEY);
  if (selectedSource === "timetable") {
    url.searchParams.set("destination", params.to);
  }

  const res = await fetch(url.toString(), { cache: "no-store" });
  const raw = await res.text();
  const parsed =
    (res.headers.get("content-type") ?? "").includes("application/json") ? tryParseJson(raw) : null;
  const dataObj = isRecord(parsed) ? parsed : null;

  if (!res.ok) {
    throw new JourneyProviderError(
      `TransportAPI request failed (${res.status}): ${JSON.stringify(parsed ?? raw.slice(0, 300))}`,
      502
    );
  }
  if (!dataObj) {
    throw new JourneyProviderError("TransportAPI returned non-JSON response.", 502);
  }

  const rows = extractDepartureRows(dataObj);
  const stationName = typeof dataObj.station_name === "string" ? dataObj.station_name : params.from;
  const services: DarwinNormalizedService[] = rows.map((r, idx) => {
    const row: Record<string, unknown> = isRecord(r) ? r : {};
    const aimedDep = toHHMM(pickString(row, ["aimed_departure_time", "departure_time"]));
    const expectedDepDirect = toHHMM(
      pickString(row, [
        "expected_departure_time",
        "live_departure_time",
        "realtime_departure_time",
        "expected_departure",
        "expected_departure_datetime",
      ])
    );
    const depEstimateMins = pickNumber(row, ["best_departure_estimate_mins"]);
    const expectedDep =
      expectedDepDirect ??
      (aimedDep && depEstimateMins !== null ? addMinutes(aimedDep, depEstimateMins) : null);

    const cancelled =
      String(pickString(row, ["status", "train_status"]) ?? "")
        .toUpperCase()
        .includes("CANC");
    const delayMins =
      aimedDep && expectedDep ? (hhmmToMins(expectedDep) ?? 0) - (hhmmToMins(aimedDep) ?? 0) : depEstimateMins;
    return {
      uid: String(pickString(row, ["train_uid", "service", "uid"]) ?? `${params.from}-${params.date}-${params.time}-${idx}`),
      operator: pickString(row, ["operator", "operator_code", "toc"]),
      operatorName: String(pickString(row, ["operator_name", "operator"]) ?? "Unknown"),
      platform: pickString(row, ["platform"]),
      originName: String(pickString(row, ["origin_name"]) ?? stationName),
      destinationName: String(pickString(row, ["destination_name"]) ?? params.to),
      aimedDeparture: aimedDep,
      expectedDeparture: expectedDep,
      delayMins: typeof delayMins === "number" && Number.isFinite(delayMins) ? delayMins : null,
      status: deriveStatus(aimedDep, expectedDep, cancelled),
      callsAtTo: undefined,
      _timetableId: isRecord(row.service_timetable) ? String((row.service_timetable as { id?: string }).id ?? "") || null : null,
    };
  });

  return { services, source, sourceReason };
}

function applyTimeWindow(services: DarwinNormalizedService[], requestedTime: string, windowMins: number) {
  const withFilterTime = services.flatMap((service) => {
    const filterTime = serviceFilterTime(service);
    if (!filterTime) return [];
    if (!isWithinWindow(filterTime, requestedTime, windowMins)) return [];
    return [{ ...service, _filterTime: filterTime }];
  });

  return withFilterTime
    .sort((a, b) => {
      const da = absDeltaMins(a._filterTime, requestedTime);
      const db = absDeltaMins(b._filterTime, requestedTime);
      if (da !== db) return da - db;
      const ta = hhmmToMins(a._filterTime) ?? Number.POSITIVE_INFINITY;
      const tb = hhmmToMins(b._filterTime) ?? Number.POSITIVE_INFINITY;
      return ta - tb;
    })
    .map((service) => {
      const { _filterTime, ...clean } = service;
      void _filterTime;
      return clean;
    });
}

export async function getJourneysFromProvider(query: JourneyProviderQuery): Promise<JourneyProviderResult> {
  if (!parseISODate(query.date)) throw new JourneyProviderError("Invalid date format. Expected YYYY-MM-DD.", 400);
  const requestedTime = toHHMM(query.time);
  if (!requestedTime) throw new JourneyProviderError("Invalid time format. Expected HH:MM.", 400);

  const todayISO = getTodayISO();
  const darwinMode = (process.env.DARWIN_MODE ?? "off").trim().toLowerCase();
  const useHsp = process.env.USE_HSP === "1";
  const nonToday = query.date !== todayISO;

  let source = chooseSource({ date: query.date }) === "live" ? "transportapi.station_live" : "transportapi.station_timetable";
  let sourceReason =
    source === "transportapi.station_live"
      ? "Using station live feed because requested date matches server-local today."
      : "Using station timetable feed because requested date is not server-local today.";
  let services: DarwinNormalizedService[] = [];

  if (darwinMode === "fixture") {
    const fixture = await fetchDarwinFixtureServices({
      from: query.from,
      to: query.to,
      date: query.date,
      time: requestedTime,
      windowMins: query.windowMins,
    });
    services = fixture.services;
    source = "darwin.fixture";
    sourceReason = "Using Darwin fixture data (DARWIN_MODE=fixture).";
  } else if (useHsp && nonToday) {
    try {
      const hsp = await fetchHspServices({
        from: query.from,
        to: query.to,
        date: query.date,
        time: requestedTime,
        windowMins: query.windowMins,
        detailsLimit: 5,
      });
      services = hsp.services;
      source = "darwin.hsp";
      sourceReason = `Using HSP provider with query ${hsp.query.from_time}-${hsp.query.to_time} ${hsp.query.days}.`;
    } catch (err) {
      if (err instanceof HspCredentialsError) {
        throw new JourneyProviderError(
          "USE_HSP=1 is enabled but HSP_USERNAME/HSP_PASSWORD are missing. Add credentials or disable USE_HSP.",
          502
        );
      }
    }
  }

  if (services.length === 0) {
    try {
      const transport = await fetchTransportApiServices({
        ...query,
        time: requestedTime,
      });
      services = transport.services;
      source = transport.source;
      sourceReason = transport.sourceReason;
    } catch (transportErr) {
      if (useHsp && nonToday) {
        if (transportErr instanceof JourneyProviderError && process.env.NODE_ENV === "development") {
          console.log("journeys transport fallback to hsp", { message: transportErr.message });
        }
        const hsp = await fetchHspServices({
          from: query.from,
          to: query.to,
          date: query.date,
          time: requestedTime,
          windowMins: query.windowMins,
          detailsLimit: 5,
        });
        services = hsp.services;
        source = "darwin.hsp";
        sourceReason = `Using HSP fallback with query ${hsp.query.from_time}-${hsp.query.to_time} ${hsp.query.days}.`;
      } else {
        throw transportErr;
      }
    }
  }

  if (useHsp && nonToday && services.length === 0) {
    try {
      const hsp = await fetchHspServices({
        from: query.from,
        to: query.to,
        date: query.date,
        time: requestedTime,
        windowMins: query.windowMins,
        detailsLimit: 5,
      });
      services = hsp.services;
      source = "darwin.hsp";
      sourceReason = `Using HSP empty-set fallback with query ${hsp.query.from_time}-${hsp.query.to_time} ${hsp.query.days}.`;
    } catch (err) {
      if (err instanceof HspCredentialsError) {
        throw new JourneyProviderError(
          "USE_HSP=1 is enabled but HSP_USERNAME/HSP_PASSWORD are missing. Add credentials or disable USE_HSP.",
          502
        );
      }
    }
  }

  const finalServices = applyTimeWindow(services, requestedTime, query.windowMins);
  if (process.env.NODE_ENV === "development") {
    console.log("journeys provider", {
      chosenSource: source,
      date: query.date,
      requestedTime,
      windowMins: query.windowMins,
      beforeCount: services.length,
      afterCount: finalServices.length,
    });
  }

  return {
    services: finalServices,
    source,
    note: [
      sourceReason,
      query.filterDest ? "Destination filtering skipped because calling-point data is not available yet." : null,
    ]
      .filter((v): v is string => Boolean(v))
      .join(" "),
  };
}
