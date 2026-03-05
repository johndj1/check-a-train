import { diffHHMM } from "@/lib/time/hhmm";

export type ServiceStatus = "On time" | "Delayed" | "Cancelled" | "Unknown";

type DelayDerivationInput = {
  cancelled: boolean;
  aimedArr: string | null | undefined;
  expectedArr: string | null | undefined;
  aimedDep: string | null | undefined;
  expectedDep: string | null | undefined;
};

type DelayDerivationResult = {
  delayMins: number | null;
  status: ServiceStatus;
};

export function deriveDelayAndStatus(input: DelayDerivationInput): DelayDerivationResult {
  if (input.cancelled) {
    return { delayMins: null, status: "Cancelled" };
  }

  const arrivalDelay =
    input.aimedArr && input.expectedArr ? diffHHMM(input.aimedArr, input.expectedArr) : null;
  if (arrivalDelay !== null) {
    return { delayMins: arrivalDelay, status: arrivalDelay > 0 ? "Delayed" : "On time" };
  }

  const departureDelay =
    input.aimedDep && input.expectedDep ? diffHHMM(input.aimedDep, input.expectedDep) : null;
  if (departureDelay !== null) {
    return { delayMins: departureDelay, status: departureDelay > 0 ? "Delayed" : "On time" };
  }

  return { delayMins: null, status: "Unknown" };
}
