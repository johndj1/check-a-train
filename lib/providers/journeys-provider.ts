import { getFixtureJourneys } from "@/lib/darwin/fixture";
import { fetchHspServices, HspCredentialsError } from "@/lib/darwin/hsp";
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

function toHHMM(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

async function getHspJourneys(query: JourneyProviderQuery): Promise<JourneyProviderResult> {
  try {
    const hsp = await fetchHspServices({
      from: query.from,
      to: query.to,
      date: query.date,
      time: query.time,
      windowMins: query.windowMins,
      detailsLimit: 5,
    });

    return {
      services: hsp.services,
      source: "darwin.hsp",
      note: `Using Darwin HSP live data (DARWIN_MODE=live) with query ${hsp.query.from_time}-${hsp.query.to_time} ${hsp.query.days}.`,
    };
  } catch (err) {
    if (err instanceof HspCredentialsError) {
      throw new JourneyProviderError(
        "DARWIN_MODE=live requires HSP_USERNAME and HSP_PASSWORD server-side credentials.",
        502
      );
    }
    throw new JourneyProviderError(
      err instanceof Error ? `Darwin live provider failed: ${err.message}` : "Darwin live provider failed.",
      502
    );
  }
}

export async function getJourneysFromProvider(query: JourneyProviderQuery): Promise<JourneyProviderResult> {
  if (!parseISODate(query.date)) {
    throw new JourneyProviderError("Invalid date format. Expected YYYY-MM-DD.", 400);
  }
  const normalizedTime = toHHMM(query.time);
  if (!normalizedTime) {
    throw new JourneyProviderError("Invalid time format. Expected HH:MM.", 400);
  }

  const darwinMode = (process.env.DARWIN_MODE ?? "fixture").trim().toLowerCase();
  let result: JourneyProviderResult;

  if (darwinMode === "fixture") {
    result = await getFixtureJourneys({
      from: query.from,
      to: query.to,
      date: query.date,
      time: normalizedTime,
      windowMins: query.windowMins,
    });
  } else if (darwinMode === "live") {
    result = await getHspJourneys({ ...query, time: normalizedTime });
  } else if (darwinMode === "off") {
    throw new JourneyProviderError(
      "Darwin provider is disabled (DARWIN_MODE=off). Set DARWIN_MODE=fixture or DARWIN_MODE=live.",
      502
    );
  } else {
    throw new JourneyProviderError(
      `Unsupported DARWIN_MODE='${darwinMode}'. Expected one of: fixture, live, off.`,
      500
    );
  }

  if (process.env.NODE_ENV === "development") {
    console.log("journeys provider", {
      chosenSource: result.source,
      date: query.date,
      requestedTime: normalizedTime,
      windowMins: query.windowMins,
      afterCount: result.services.length,
    });
  }

  const note = [
    result.note,
    query.filterDest ? "Destination filtering skipped because calling-point data is not available yet." : null,
  ]
    .filter((v): v is string => Boolean(v))
    .join(" ");

  return {
    ...result,
    note,
  };
}
