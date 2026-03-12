import { readFile } from "node:fs/promises";
import path from "node:path";
import { rankServicesForJourney } from "@/lib/darwin/match";
import type {
  DarwinFixtureFetchParams,
  DarwinMatchingDiagnostics,
  DarwinNormalizedService,
} from "@/lib/darwin/types";
import { deriveDelayAndStatus } from "@/lib/status/deriveDelayAndStatus";
import { isWithinWindow } from "@/lib/time/window";

type FixtureService = {
  rid: string;
  operator: string;
  aimedDeparture: string | null;
  expectedDeparture: string | null;
  aimedArrival: string | null;
  expectedArrival: string | null;
  platform: string | null;
  status: string;
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

  const baseServices: DarwinNormalizedService[] = (payload.services ?? []).map((service, idx) => {
    const aimedDeparture = toHHMM(service.aimedDeparture);
    const expectedDeparture = toHHMM(service.expectedDeparture);
    const aimedArrival = toHHMM(service.aimedArrival) ?? "";
    const expectedArrival = toHHMM(service.expectedArrival);
    const cancelled = String(service.status ?? "").toUpperCase().includes("CANC");
    const { delayMins, status } = deriveDelayAndStatus({
      cancelled,
      aimedArr: aimedArrival || null,
      expectedArr: expectedArrival,
      aimedDep: aimedDeparture,
      expectedDep: expectedDeparture,
    });

    return {
      uid: `DARWIN:${service.rid || idx}`,
      operator: service.operator ?? null,
      operatorName: service.operator ?? "Unknown",
      platform: service.platform,
      originName: query.from.toUpperCase(),
      destinationName: query.to.toUpperCase(),
      aimedDeparture,
      expectedDeparture,
      aimedArrival,
      expectedArrival,
      delayMins,
      status,
      callsAtTo: undefined,
      rawStatusText: service.status,
      _timetableId: service.rid,
    };
  });

  const withinWindow = baseServices.filter((service) => {
    const at = filterTime(service);
    if (!at) return false;
    return isWithinWindow(at, requestedTime, windowMins);
  });

  const matched = rankServicesForJourney(withinWindow, { time: requestedTime });
  const sampleExclusions: DarwinMatchingDiagnostics["sampleExclusions"] = [];
  const normalizedServiceSample = baseServices.slice(0, 3).map((service) => ({
    uid: service.uid,
    destinationName: service.destinationName,
    aimedDeparture: service.aimedDeparture,
    expectedDeparture: service.expectedDeparture,
    callsAtTo: service.callsAtTo ?? null,
  }));
  for (const service of baseServices) {
    const at = filterTime(service);
    if (!at) {
      if (sampleExclusions.length < 5) {
        sampleExclusions.push({
          uid: service.uid,
          reason: "missing_filter_time",
          filterTime: null,
          callsAtTo: service.callsAtTo ?? null,
          destinationName: service.destinationName,
        });
      }
      continue;
    }
    if (!isWithinWindow(at, requestedTime, windowMins) && sampleExclusions.length < 5) {
      sampleExclusions.push({
        uid: service.uid,
        reason: "outside_window",
        filterTime: at,
        callsAtTo: service.callsAtTo ?? null,
        destinationName: service.destinationName,
      });
    }
  }
  const diagnostics: DarwinMatchingDiagnostics = {
    requestedTime,
    windowMins,
    rawServiceCount: payload.services?.length ?? 0,
    normalizedServiceCount: baseServices.length,
    afterTimeWindowCount: withinWindow.length,
    afterDestinationFilterCount: withinWindow.length,
    candidateCount: withinWindow.length,
    excludedMissingFilterTime: baseServices.filter((service) => !filterTime(service)).length,
    excludedOutsideWindow: baseServices.filter((service) => {
      const at = filterTime(service);
      return at ? !isWithinWindow(at, requestedTime, windowMins) : false;
    }).length,
    destinationConfirmedCount: 0,
    destinationMismatchCount: 0,
    destinationUnknownCount: withinWindow.length,
    normalizedServiceSample,
    sampleExclusions,
  };

  return {
    ...matched,
    diagnostics,
    source: "darwin.fixture",
    note: "Using Darwin fixture data (DARWIN_MODE=fixture).",
  };
}
