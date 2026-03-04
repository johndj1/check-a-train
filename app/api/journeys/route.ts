import { NextResponse } from "next/server";

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

function toHHMM(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const text = v.trim();
  const m = /^(\d{2}):(\d{2})/.exec(text) ?? /T(\d{2}):(\d{2})/.exec(text);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return `${m[1]}:${m[2]}`;
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

export async function GET(req: Request) {
  try {
    console.log("✅ /api/journeys hit");

    const APP_ID = requireEnv("TRANSPORT_API_ID");
    const APP_KEY = requireEnv("TRANSPORT_API_KEY");

    const { searchParams } = new URL(req.url);

    const from = searchParams.get("from")?.trim(); // CRS, e.g. SEV
    const to = searchParams.get("to")?.trim(); // CRS, e.g. LBG (not used yet)
    const date = searchParams.get("date")?.trim(); // YYYY-MM-DD
    const time = searchParams.get("time")?.trim(); // HH:MM
    const window = Number(searchParams.get("window") ?? "30");
    const windowMins = Number.isFinite(window) ? Math.min(Math.max(window, 0), 180) : 30;
    const filterDest = searchParams.get("filterDest") === "1";

    if (!from || !to || !date || !time) {
      return NextResponse.json(
        { error: "Missing required params: from, to, date, time" },
        { status: 400 }
      );
    }

    const url = new URL(
      `https://transportapi.com/v3/uk/train/station/${encodeURIComponent(from)}/live.json`
    );
    url.searchParams.set("app_id", APP_ID);
    url.searchParams.set("app_key", APP_KEY);
    // live.json does not support the same date/time query behavior as journey planner.
    // We keep date/time in query echo for UI consistency and note this in response.

    const res = await fetch(url.toString(), { cache: "no-store" });
    const raw = await res.text();
    const parsed =
      (res.headers.get("content-type") ?? "").includes("application/json")
        ? tryParseJson(raw)
        : null;
    const dataObj = isRecord(parsed) ? parsed : null;
    const errorMessage =
      dataObj && typeof dataObj.error === "string"
        ? dataObj.error
        : "TransportAPI station live request failed";

    if (!res.ok || !dataObj) {
      return NextResponse.json(
        {
          error: errorMessage,
          upstreamStatus: res.status || 502,
          upstream: parsed ?? raw.slice(0, 500),
        },
        { status: res.status || 502 }
      );
    }

    const departures = isRecord(dataObj.departures) ? dataObj.departures : null;
    const rows = Array.isArray(departures?.all) ? departures.all : [];
    const stationName =
      typeof dataObj.station_name === "string" ? dataObj.station_name : from;

    const services = rows.map((r, idx) => {
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
        aimedDeparture: aimedDep ?? "",
        expectedDeparture: expectedDep,
        delayMins,
        status,
        callsAtTo: undefined,
        _timetableId: timetableId,
      };
    });

    const filtered = filterDest
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
    const timeFiltered = filtered.filter((s) =>
      isWithinWindow(s.aimedDeparture, time, windowMins)
    );

    if (process.env.NODE_ENV === "development") {
      const aimed = timeFiltered
        .map((s) => s.aimedDeparture)
        .filter((v): v is string => typeof v === "string" && v.length > 0);
      const first = aimed[0] ?? "n/a";
      const last = aimed[aimed.length - 1] ?? "n/a";
      console.log(
        `[journeys] from=${from} to=${to} requested=${time} window=+/-${windowMins} count=${timeFiltered.length} first=${first} last=${last}`
      );
    }

    return NextResponse.json({
      query: { from, to, date, time, window: windowMins },
      services: timeFiltered.map((service) => {
        const { _timetableId, ...clean } = service;
        void _timetableId;
        return clean;
      }),
      source: "transportapi.station_live",
      note:
        "Using station live departures feed (Free plan compatible). date/time/window are request-context fields and not hard filters at source.",
    });
  } catch (e) {
    console.error("❌ /api/journeys error:", e);
    const isDev = process.env.NODE_ENV === "development";
    const body: { error: string; stack?: string } = {
      error: (e as Error).message ?? "Server error",
    };
    if (isDev) {
      body.stack = (e as Error).stack ?? "";
    }
    return NextResponse.json(
      body,
      { status: 500 }
    );
  }
}
