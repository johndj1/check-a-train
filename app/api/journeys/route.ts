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
    const data = isJson ? (JSON.parse(raw) as any) : null;

    if (!res.ok) {
      return NextResponse.json(
        {
          error: data?.error ?? "TransportAPI request failed",
          upstreamStatus: res.status,
          upstream: data ?? raw.slice(0, 500),
        },
        { status: res.status }
      );
    }

    const rows: any[] = Array.isArray(data?.departures?.all) ? data.departures.all : [];

    const services = rows.map((r) => {
      const aimed = r.aimed_departure_time ?? null;
      const expected = r.expected_departure_time ?? null;

      const delayMins =
        aimed && expected ? diffMins(String(aimed), String(expected)) : null;

      return {
        uid: String(r.train_uid ?? r.service ?? `${r.operator ?? ""}-${aimed ?? ""}`),
        operator: r.operator ?? null,
        operatorName: String(r.operator_name ?? r.operator ?? "Unknown"),
        platform: r.platform ?? null,

        originName: String(r.origin_name ?? data?.station_name ?? from),
        destinationName: String(r.destination_name ?? ""),

        aimedDeparture: String(aimed ?? ""),
        expectedDeparture: expected ? String(expected) : null,
        delayMins,

        status: asStatus(r.status),
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
    return NextResponse.json(
      {
        error: (e as Error).message ?? "Server error",
        stack: (e as Error).stack ?? null, // dev-only usefulness
      },
      { status: 500 }
    );
  }
}