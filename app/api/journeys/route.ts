import { NextResponse } from "next/server";
import { fetchDarwinServices, type DarwinNormalizedService } from "@/lib/darwin/client";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function hhmmToMins(hhmm: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function isWithinWindow(targetHHMM: string, centerHHMM: string, windowMins: number) {
  const target = hhmmToMins(targetHHMM);
  const center = hhmmToMins(centerHHMM);
  if (target == null || center == null || !Number.isFinite(windowMins) || windowMins < 0) {
    return false;
  }
  let delta = target - center;
  if (delta < -720) delta += 1440;
  if (delta > 720) delta -= 1440;
  return Math.abs(delta) <= windowMins;
}

function absDeltaMins(targetHHMM: string, centerHHMM: string) {
  const target = hhmmToMins(targetHHMM);
  const center = hhmmToMins(centerHHMM);
  if (target == null || center == null) return Number.POSITIVE_INFINITY;
  let delta = target - center;
  if (delta < -720) delta += 1440;
  if (delta > 720) delta -= 1440;
  return Math.abs(delta);
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

function chooseSource(params: { date: string; now?: Date }) {
  const now = params.now ?? new Date();
  const todayISO = getTodayISO(now);
  return params.date === todayISO ? ("live" as const) : ("timetable" as const);
}

function diffMins(aimed: string, expected: string) {
  const a = hhmmToMins(aimed);
  const e = hhmmToMins(expected);
  if (a == null || e == null) return null;
  // allow wrap (rare but safe)
  let d = e - a;
  if (d < -720) d += 1440;
  if (d > 720) d -= 1440;
  return d;
}

function addMinsToHHMM(hhmm: string, minsToAdd: number) {
  const base = hhmmToMins(hhmm);
  if (base == null || !Number.isFinite(minsToAdd)) return null;
  let total = base + minsToAdd;
  total = ((total % 1440) + 1440) % 1440;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function serviceFilterTime(service: { expectedDeparture: string | null; aimedDeparture: string | null }) {
  return toHHMM(service.expectedDeparture) ?? toHHMM(service.aimedDeparture);
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isCancelledStatus(s: string | null | undefined) {
  const v = (s ?? "").toUpperCase();
  return (
    v.includes("CANCEL") ||
    v.includes("CANC") ||
    v.includes("CANC/NR")
  );
}

function deriveStatus(
  upstreamStatus: string | null | undefined,
  delayMins: number | null
): "On time" | "Delayed" | "Cancelled" | "Unknown" {
  if (isCancelledStatus(upstreamStatus)) return "Cancelled";
  if (delayMins !== null) {
    if (delayMins > 0) return "Delayed";
    if (delayMins === 0) return "On time";
  }
  return "Unknown";
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

function summarizeDelay(services: DarwinNormalizedService[]) {
  const summary = {
    delayed: 0,
    onTime: 0,
    cancelled: 0,
    unknown: 0,
    withDelayMins: 0,
  };
  for (const service of services) {
    if (typeof service.delayMins === "number") summary.withDelayMins += 1;
    if (service.status === "Delayed") summary.delayed += 1;
    else if (service.status === "On time") summary.onTime += 1;
    else if (service.status === "Cancelled") summary.cancelled += 1;
    else summary.unknown += 1;
  }
  return summary;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const from = searchParams.get("from")?.trim(); // CRS, e.g. SEV
    const to = searchParams.get("to")?.trim(); // CRS, e.g. LBG (not used yet)
    const date = searchParams.get("date")?.trim(); // YYYY-MM-DD
    const time = searchParams.get("time")?.trim(); // HH:MM
    const window = Number(searchParams.get("window") ?? "30");
    const windowMins = Number.isFinite(window) ? Math.min(Math.max(window, 0), 180) : 30;
    const filterDest = searchParams.get("filterDest") === "1";
    const hasCallingPointData = false;

    if (!from || !to || !date || !time) {
      return NextResponse.json(
        { error: "Missing required params: from, to, date, time" },
        { status: 400 }
      );
    }
    const requestedTime = toHHMM(time);
    if (!requestedTime) {
      return NextResponse.json(
        { error: "Invalid time format. Expected HH:MM." },
        { status: 400 }
      );
    }
    if (!parseISODate(date)) {
      return NextResponse.json(
        { error: "Invalid date format. Expected YYYY-MM-DD." },
        { status: 400 }
      );
    }
    const todayYYYYMMDD = getTodayISO();
    const selectedSource = chooseSource({ date });
    const darwinMode = (process.env.DARWIN_MODE ?? "off").trim().toLowerCase();
    let source =
      selectedSource === "live" ? "transportapi.station_live" : "transportapi.station_timetable";
    let sourceReason =
      selectedSource === "live"
        ? "Using station live feed because requested date matches server-local today."
        : "Using station timetable feed because requested date is not server-local today.";

    if (process.env.NODE_ENV === "development") {
      console.log("journeys request", { from, to, date, time: requestedTime, window: windowMins });
    }

    let services: DarwinNormalizedService[] | null = null;
    if (darwinMode === "fixture") {
      try {
        const darwinResult = await fetchDarwinServices({
          fromCrs: from,
          toCrs: to,
          date,
          time: requestedTime,
          windowMins,
        });
        services = darwinResult.services;
        source = "darwin.fixture";
        sourceReason =
          "Using Darwin fixture data (DARWIN_MODE=fixture) for deterministic service status and delay data.";
        if (process.env.NODE_ENV === "development") {
          console.log("journeys upstream", {
            source,
            returnedServices: services.length,
            delaySummary: summarizeDelay(services),
          });
        }
      } catch (darwinErr) {
        return NextResponse.json(
          {
            error: "Darwin fixture request failed",
            message: darwinErr instanceof Error ? darwinErr.message : "Unknown Darwin fixture error",
          },
          { status: 502 }
        );
      }
    }

    if (!services) {
      const APP_ID = requireEnv("TRANSPORT_API_ID");
      const APP_KEY = requireEnv("TRANSPORT_API_KEY");
      const url =
        selectedSource === "live"
          ? new URL(`https://transportapi.com/v3/uk/train/station/${encodeURIComponent(from)}/live.json`)
          : new URL(
              `https://transportapi.com/v3/uk/train/station/${encodeURIComponent(from)}/${encodeURIComponent(date)}/${encodeURIComponent(requestedTime)}/timetable.json`
            );
      url.searchParams.set("app_id", APP_ID);
      url.searchParams.set("app_key", APP_KEY);
      if (selectedSource === "timetable") {
        url.searchParams.set("destination", to);
      }

      let res: Response;
      try {
        res = await fetch(url.toString(), { cache: "no-store" });
      } catch (err) {
        return NextResponse.json(
          {
            error: "TransportAPI request failed",
            message: err instanceof Error ? err.message : "Unknown upstream fetch error",
          },
          { status: 502 }
        );
      }

      if (process.env.NODE_ENV === "development") {
        console.log("upstream status", res.status);
      }

      let raw = "";
      try {
        raw = await res.text();
      } catch {
        raw = "";
      }
      const parsed =
        (res.headers.get("content-type") ?? "").includes("application/json")
          ? tryParseJson(raw)
          : null;
      const dataObj = isRecord(parsed) ? parsed : null;

      if (!res.ok) {
        return NextResponse.json(
          {
            error: "TransportAPI request failed",
            upstreamStatus: res.status,
            upstream: parsed ?? raw.slice(0, 500),
          },
          { status: 502 }
        );
      }

      if (!dataObj) {
        return NextResponse.json(
          {
            error: "TransportAPI returned non-JSON response",
            upstreamStatus: res.status,
            upstream: raw.slice(0, 500),
          },
          { status: 502 }
        );
      }

      const rows = extractDepartureRows(dataObj);
      const stationName =
        typeof dataObj.station_name === "string" ? dataObj.station_name : from;

      services = rows.map((r, idx) => {
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
          (aimedDep && depEstimateMins !== null ? addMinsToHHMM(aimedDep, depEstimateMins) : null);

        const aimedArr = toHHMM(pickString(row, ["aimed_arrival_time", "arrival_time"]));
        const expectedArr = toHHMM(
          pickString(row, [
            "expected_arrival_time",
            "live_arrival_time",
            "realtime_arrival_time",
            "expected_arrival",
            "expected_arrival_datetime",
          ])
        );
        const delayMins =
          aimedArr && expectedArr
            ? diffMins(aimedArr, expectedArr)
            : aimedDep && expectedDep
              ? diffMins(aimedDep, expectedDep)
              : depEstimateMins;
        const statusCandidate = pickString(row, ["status", "train_status"]);
        const status = deriveStatus(statusCandidate, delayMins);
        const serviceTimetable = isRecord(row.service_timetable) ? row.service_timetable : null;
        const timetableId =
          serviceTimetable && typeof serviceTimetable.id === "string" ? serviceTimetable.id : null;

        return {
          uid: String(
            pickString(row, ["train_uid", "service", "uid"]) ?? `${from}-${date}-${time}-${idx}`
          ),
          operator: pickString(row, ["operator", "operator_code", "toc"]),
          operatorName: String(pickString(row, ["operator_name", "operator"]) ?? "Unknown"),
          platform: pickString(row, ["platform"]),
          originName: String(pickString(row, ["origin_name"]) ?? stationName),
          destinationName: String(pickString(row, ["destination_name"]) ?? to),
          aimedDeparture: aimedDep,
          expectedDeparture: expectedDep,
          delayMins,
          status,
          callsAtTo: undefined,
          _timetableId: timetableId,
        };
      });

      if (process.env.NODE_ENV === "development") {
        console.log("journeys upstream", {
          source,
          returnedServices: services.length,
          delaySummary: summarizeDelay(services),
        });
      }
    }

    const filtered = filterDest && hasCallingPointData
      ? services.filter((s) => {
          const destMatch =
            typeof s.destinationName === "string" &&
            s.destinationName.toUpperCase().includes(to.toUpperCase());
          const timetableMatch =
            typeof s._timetableId === "string" &&
            s._timetableId.toUpperCase().includes(to.toUpperCase());
          return destMatch || timetableMatch;
        })
      : services;
    const withFilterTime = filtered.flatMap((service) => {
      const filterTime = serviceFilterTime(service);
      if (!filterTime) return [];
      if (!isWithinWindow(filterTime, requestedTime, windowMins)) return [];
      return [{ ...service, _filterTime: filterTime }];
    });

    const finalServices = withFilterTime.sort((a, b) => {
      const da = absDeltaMins(a._filterTime, requestedTime);
      const db = absDeltaMins(b._filterTime, requestedTime);
      if (da !== db) return da - db;
      const ta = hhmmToMins(a._filterTime) ?? Number.POSITIVE_INFINITY;
      const tb = hhmmToMins(b._filterTime) ?? Number.POSITIVE_INFINITY;
      return ta - tb;
    });

    if (process.env.NODE_ENV === "development") {
      const beforeTimes = filtered
        .map((s) => serviceFilterTime(s))
        .filter((v): v is string => typeof v === "string" && v.length > 0)
        .slice(0, 5);
      const afterTimes = finalServices
        .map((s) => s._filterTime)
        .filter((v): v is string => typeof v === "string" && v.length > 0)
        .slice(0, 5);
      console.log("journeys time-window filter", {
        chosenSource: source,
        todayYYYYMMDD,
        date,
        requestedTime,
        windowMins,
        beforeCount: filtered.length,
        afterCount: finalServices.length,
        beforeTimes,
        afterTimes,
      });
    }

    return NextResponse.json({
      query: { from, to, date, time: requestedTime, window: windowMins },
      services: finalServices.map((service) => {
        const { _timetableId, _filterTime, ...clean } = service;
        void _timetableId;
        void _filterTime;
        return clean;
      }),
      source,
      note: [
        sourceReason,
        filterDest && !hasCallingPointData
          ? "Destination filtering skipped because calling-point data is not available yet."
          : null,
      ]
        .filter((v): v is string => Boolean(v))
        .join(" "),
    });
  } catch (e) {
    console.error("❌ /api/journeys error:", e);
    const message = e instanceof Error ? e.message : "Unknown server error";
    return NextResponse.json({ error: "Server error", message }, { status: 500 });
  }
}
