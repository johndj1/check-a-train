import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DarwinFixtureFetchParams, DarwinNormalizedService } from "@/lib/darwin/types";
import { hhmmToMins } from "@/lib/time/hhmm";
import { absDeltaMins, isWithinWindow } from "@/lib/time/window";

type FixtureStatus = "On time" | "Delayed" | "Cancelled" | "Unknown";

type FixtureService = {
  rid: string;
  operator: string;
  aimedDeparture: string | null;
  expectedDeparture: string | null;
  aimedArrival: string | null;
  expectedArrival: string | null;
  platform: string | null;
  status: FixtureStatus;
  delayMins: number | null;
};

type FixturePayload = {
  services: FixtureService[];
};

function fixturePath(fileName: string) {
  return path.join(process.cwd(), "fixtures", "darwin", fileName);
}

function toHHMM(v: string | null) {
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

function toStatus(v: string): DarwinNormalizedService["status"] {
  if (v === "On time" || v === "Delayed" || v === "Cancelled") return v;
  return "Unknown";
}

function filterTime(service: DarwinNormalizedService) {
  return service.expectedDeparture ?? service.aimedDeparture;
}

export async function getFixtureJourneys(query: DarwinFixtureFetchParams) {
  const raw = await readFile(fixturePath("sev-lbg-sample.json"), "utf8");
  const payload = JSON.parse(raw) as FixturePayload;
  const requestedTime = toHHMM(query.time);
  const windowMins = Number.isFinite(query.windowMins) ? Math.max(0, query.windowMins ?? 30) : 30;
  if (!requestedTime) {
    throw new Error("Invalid query time for Darwin fixture provider.");
  }

  const baseServices: DarwinNormalizedService[] = (payload.services ?? []).map((service, idx) => ({
    uid: `DARWIN:${service.rid || idx}`,
    operator: service.operator ?? null,
    operatorName: service.operator ?? "Unknown",
    platform: service.platform,
    originName: query.from.toUpperCase(),
    destinationName: query.to.toUpperCase(),
    aimedDeparture: toHHMM(service.aimedDeparture),
    expectedDeparture: toHHMM(service.expectedDeparture),
    delayMins: typeof service.delayMins === "number" ? service.delayMins : null,
    status: toStatus(service.status),
    callsAtTo: undefined,
    _timetableId: service.rid,
  }));

  const withinWindow = baseServices
    .flatMap((service) => {
      const at = filterTime(service);
      if (!at) return [];
      if (!isWithinWindow(at, requestedTime, windowMins)) return [];
      return [service];
    })
    .sort((a, b) => {
      const aTime = filterTime(a) ?? "00:00";
      const bTime = filterTime(b) ?? "00:00";
      const deltaA = absDeltaMins(aTime, requestedTime);
      const deltaB = absDeltaMins(bTime, requestedTime);
      if (deltaA !== deltaB) return deltaA - deltaB;
      const minsA = hhmmToMins(aTime) ?? Number.POSITIVE_INFINITY;
      const minsB = hhmmToMins(bTime) ?? Number.POSITIVE_INFINITY;
      return minsA - minsB;
    });

  return {
    services: withinWindow,
    source: "darwin.fixture",
    note: "Using Darwin fixture data (DARWIN_MODE=fixture).",
  };
}
