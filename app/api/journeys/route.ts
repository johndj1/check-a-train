import { NextResponse } from "next/server";
import { getJourneysFromProvider, JourneyProviderError } from "@/lib/providers/journeys-provider";

function toHHMM(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const text = v.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(text);
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const from = searchParams.get("from")?.trim();
    const to = searchParams.get("to")?.trim();
    const date = searchParams.get("date")?.trim();
    const timeRaw = searchParams.get("time")?.trim();
    const window = Number(searchParams.get("window") ?? "30");
    const windowMins = Number.isFinite(window) ? Math.min(Math.max(window, 0), 180) : 30;
    const filterDest = searchParams.get("filterDest") === "1";

    if (!from || !to || !date || !timeRaw) {
      return NextResponse.json(
        { error: "Missing required params: from, to, date, time" },
        { status: 400 }
      );
    }

    const time = toHHMM(timeRaw);
    if (!time) {
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

    const providerResult = await getJourneysFromProvider({
      from,
      to,
      date,
      time,
      windowMins,
      filterDest,
    });

    return NextResponse.json({
      query: { from, to, date, time, window: windowMins },
      services: providerResult.services,
      source: providerResult.source,
      note: providerResult.note,
    });
  } catch (err) {
    if (err instanceof JourneyProviderError) {
      return NextResponse.json(
        { error: "Provider error", message: err.message },
        { status: err.status }
      );
    }

    console.error("❌ /api/journeys error:", err);
    const message = err instanceof Error ? err.message : "Unknown server error";
    return NextResponse.json({ error: "Server error", message }, { status: 500 });
  }
}
