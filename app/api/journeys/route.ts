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

function asStatus(s: string | null | undefined): "On time" | "Delayed" | "Cancelled" {
  const v = (s ?? "").toUpperCase();
  if (v.includes("CANCEL")) return "Cancelled";
  if (v.includes("LATE") || v.includes("DELAY")) return "Delayed";
  return "On time";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
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

    if (!from || !to || !date || !time) {
      return NextResponse.json(
        { error: "Missing required params: from, to, date, time" },
        { status: 400 }
      );
    }

    // ✅ This endpoint matches the JSON you pasted (station departures)
    const url = new URL(
      `https://transportapi.com/v3/uk/train/station/${encodeURIComponent(from)}/${encodeURIComponent(
        date
      )}/${encodeURIComponent(time)}/timetable.json`
    );

    url.searchParams.set("app_id", APP_ID);
    url.searchParams.set("app_key", APP_KEY);
    url.searchParams.set("live", "true");

    // Optional tuning (safe to remove if unsupported by your plan)
    url.searchParams.set("type", "departure");

    const res = await fetch(url.toString(), { cache: "no-store" });
    const raw = await res.text();

    const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
    const data: unknown = isJson ? JSON.parse(raw) : null;
    const dataObj = isRecord(data) ? data : null;
    const errorMessage =
      dataObj && typeof dataObj.error === "string"
        ? dataObj.error
        : "TransportAPI request failed";

    if (!res.ok) {
      return NextResponse.json(
        {
          error: errorMessage,
          upstreamStatus: res.status,
          upstream: data ?? raw.slice(0, 500),
        },
        { status: res.status }
      );
    }

    const departures = dataObj?.departures;
    const departureObj = isRecord(departures) ? departures : null;
    const rows: unknown[] = Array.isArray(departureObj?.all) ? departureObj.all : [];
    const stationName = typeof dataObj?.station_name === "string" ? dataObj.station_name : null;

    const services = rows.map((r) => {
      const row = isRecord(r) ? r : {};
      const aimed = row.aimed_departure_time ?? null;
      const expected = row.expected_departure_time ?? null;

      const delayMins =
        aimed && expected ? diffMins(String(aimed), String(expected)) : null;

      return {
        uid: String(row.train_uid ?? row.service ?? `${row.operator ?? ""}-${aimed ?? ""}`),
        operator: row.operator ?? null,
        operatorName: String(row.operator_name ?? row.operator ?? "Unknown"),
        platform: row.platform ?? null,

        originName: String(row.origin_name ?? stationName ?? from),
        destinationName: String(row.destination_name ?? ""),

        aimedDeparture: String(aimed ?? ""),
        expectedDeparture: expected ? String(expected) : null,
        delayMins,

        status: asStatus(typeof row.status === "string" ? row.status : null),
        callsAtTo: undefined, // we'll compute this later (Darwin / timetable)
      };
    });

    return NextResponse.json({
      query: { from, to, date, time, window },
      services,
      source: "transportapi.station_timetable",
      note:
        "MVP uses station departures. Filtering to destination/calling points comes next.",
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
