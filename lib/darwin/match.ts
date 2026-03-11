import type {
  DarwinFirstPassStatus,
  DarwinNormalizedService,
  ServiceStatus,
} from "@/lib/darwin/types";
import { diffHHMM, hhmmToMins } from "@/lib/time/hhmm";
import { absDeltaMins } from "@/lib/time/window";

type JourneyMatchParams = {
  time: string;
};

type RankedDarwinJourneyMatch = {
  services: DarwinNormalizedService[];
  selectedService: DarwinNormalizedService | null;
  firstPassStatus: DarwinFirstPassStatus;
};

function plannedDepartureForMatch(service: DarwinNormalizedService) {
  return service.aimedDeparture ?? service.expectedDeparture;
}

function realtimeDepartureForMatch(service: DarwinNormalizedService) {
  return service.expectedDeparture ?? service.aimedDeparture;
}

function inferRawStatus(rawStatusText: string | null | undefined): ServiceStatus | null {
  const text = rawStatusText?.trim() ?? "";
  if (!text) return null;
  if (/^cancel/i.test(text) || /\bcanc\b/i.test(text)) return "Cancelled";
  if (/^on time$/i.test(text) || /\bon time\b/i.test(text)) return "On time";
  if (/^delayed$/i.test(text) || /\bdelayed\b/i.test(text)) return "Delayed";
  return null;
}

function deriveUnknownStatus(serviceUid: string | null): DarwinFirstPassStatus {
  return {
    status: "Unknown",
    delayMins: null,
    basis: "unknown",
    confidence: "low",
    matchedServiceUid: serviceUid,
  };
}

export function deriveFirstPassStatus(service: DarwinNormalizedService | null): DarwinFirstPassStatus {
  if (!service) {
    return deriveUnknownStatus(null);
  }

  if (service.status === "Cancelled") {
    return {
      status: "Cancelled",
      delayMins: null,
      basis: service.rawStatusText ? "raw_status" : "unknown",
      confidence: "high",
      matchedServiceUid: service.uid,
    };
  }

  if (service.callsAtTo !== false && service.aimedArrival && service.expectedArrival) {
    const delayMins = diffHHMM(service.aimedArrival, service.expectedArrival);
    if (delayMins !== null) {
      return {
        status: delayMins > 0 ? "Delayed" : "On time",
        delayMins,
        basis: "arrival",
        confidence: service.callsAtTo === true ? "high" : "medium",
        matchedServiceUid: service.uid,
      };
    }
  }

  if (service.aimedDeparture && service.expectedDeparture) {
    const delayMins = diffHHMM(service.aimedDeparture, service.expectedDeparture);
    if (delayMins !== null) {
      return {
        status: delayMins > 0 ? "Delayed" : "On time",
        delayMins,
        basis: "departure",
        confidence: "medium",
        matchedServiceUid: service.uid,
      };
    }
  }

  const rawStatus = inferRawStatus(service.rawStatusText);
  if (rawStatus === "Cancelled") {
    return {
      status: rawStatus,
      delayMins: null,
      basis: "raw_status",
      confidence: "high",
      matchedServiceUid: service.uid,
    };
  }
  if (rawStatus === "On time") {
    return {
      status: rawStatus,
      delayMins: 0,
      basis: "raw_status",
      confidence: "medium",
      matchedServiceUid: service.uid,
    };
  }
  if (rawStatus === "Delayed") {
    return {
      status: rawStatus,
      delayMins: service.delayMins,
      basis: "raw_status",
      confidence: service.delayMins === null ? "low" : "medium",
      matchedServiceUid: service.uid,
    };
  }

  if (service.status !== "Unknown") {
    return {
      status: service.status,
      delayMins: service.delayMins,
      basis: "unknown",
      confidence: "low",
      matchedServiceUid: service.uid,
    };
  }

  return deriveUnknownStatus(service.uid);
}

function scoreServiceMatch(service: DarwinNormalizedService, params: JourneyMatchParams) {
  const plannedDeparture = plannedDepartureForMatch(service);
  const realtimeDeparture = realtimeDepartureForMatch(service);
  const plannedDelta = plannedDeparture ? absDeltaMins(plannedDeparture, params.time) : Number.POSITIVE_INFINITY;
  const realtimeDelta = realtimeDeparture
    ? absDeltaMins(realtimeDeparture, params.time)
    : Number.POSITIVE_INFINITY;

  let score = 0;

  if (service.callsAtTo === true) {
    score += 2000;
  } else if (service.callsAtTo == null) {
    score += 250;
  } else {
    score -= 2000;
  }

  if (Number.isFinite(plannedDelta)) {
    score += Math.max(0, 600 - plannedDelta * 20);
    if (plannedDelta === 0) score += 120;
  }

  if (Number.isFinite(realtimeDelta)) {
    score += Math.max(0, 300 - realtimeDelta * 10);
    if (realtimeDelta === 0) score += 40;
  }

  if (service.aimedArrival && (service.expectedArrival || service.status === "Cancelled")) {
    score += 40;
  }

  if (service.status !== "Unknown") {
    score += 20;
  }

  return score;
}

function compareRankedServices(
  a: DarwinNormalizedService,
  b: DarwinNormalizedService,
  requestedTime: string,
) {
  const scoreDelta = (b.matchScore ?? Number.NEGATIVE_INFINITY) - (a.matchScore ?? Number.NEGATIVE_INFINITY);
  if (scoreDelta !== 0) return scoreDelta;

  const aPlanned = plannedDepartureForMatch(a);
  const bPlanned = plannedDepartureForMatch(b);
  const aPlannedDelta = aPlanned ? absDeltaMins(aPlanned, requestedTime) : Number.POSITIVE_INFINITY;
  const bPlannedDelta = bPlanned ? absDeltaMins(bPlanned, requestedTime) : Number.POSITIVE_INFINITY;
  if (aPlannedDelta !== bPlannedDelta) return aPlannedDelta - bPlannedDelta;

  const aRealtime = realtimeDepartureForMatch(a);
  const bRealtime = realtimeDepartureForMatch(b);
  const aRealtimeDelta = aRealtime ? absDeltaMins(aRealtime, requestedTime) : Number.POSITIVE_INFINITY;
  const bRealtimeDelta = bRealtime ? absDeltaMins(bRealtime, requestedTime) : Number.POSITIVE_INFINITY;
  if (aRealtimeDelta !== bRealtimeDelta) return aRealtimeDelta - bRealtimeDelta;

  const aClock = hhmmToMins(aPlanned ?? aRealtime ?? "23:59") ?? Number.POSITIVE_INFINITY;
  const bClock = hhmmToMins(bPlanned ?? bRealtime ?? "23:59") ?? Number.POSITIVE_INFINITY;
  return aClock - bClock;
}

export function rankServicesForJourney(
  services: DarwinNormalizedService[],
  params: JourneyMatchParams,
): RankedDarwinJourneyMatch {
  const ranked = [...services]
    .map((service) => {
      const firstPassStatus = deriveFirstPassStatus(service);
      return {
        ...service,
        matchScore: scoreServiceMatch(service, params),
        statusBasis: firstPassStatus.basis,
        statusConfidence: firstPassStatus.confidence,
      };
    })
    .sort((a, b) => compareRankedServices(a, b, params.time))
    .map((service, index) => ({
      ...service,
      isBestMatch: index === 0,
    }));

  const selectedService = ranked[0] ?? null;
  return {
    services: ranked,
    selectedService,
    firstPassStatus: deriveFirstPassStatus(selectedService),
  };
}
