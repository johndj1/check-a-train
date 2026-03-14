import type { ServiceStatus } from "@/lib/darwin/types";
import { diffHHMM } from "@/lib/time/hhmm";

export type DelayDerivationBasis = "arrival" | "departure" | "cancelled" | "unknown";

export type DelayDerivationInput = {
  cancelled: boolean;
  aimedArr: string | null | undefined;
  expectedArr: string | null | undefined;
  aimedDep: string | null | undefined;
  expectedDep: string | null | undefined;
};

export type DelayDerivationResult = {
  delayMins: number | null;
  status: ServiceStatus;
  basis: DelayDerivationBasis;
};

export function deriveDelayAndStatus(input: DelayDerivationInput): DelayDerivationResult {
  if (input.cancelled) {
    return { delayMins: null, status: "Cancelled", basis: "cancelled" };
  }

  const arrivalDelay =
    input.aimedArr && input.expectedArr ? diffHHMM(input.aimedArr, input.expectedArr) : null;
  if (arrivalDelay !== null) {
    return {
      delayMins: arrivalDelay,
      status: arrivalDelay > 0 ? "Delayed" : "On time",
      basis: "arrival",
    };
  }

  const departureDelay =
    input.aimedDep && input.expectedDep ? diffHHMM(input.aimedDep, input.expectedDep) : null;
  if (departureDelay !== null) {
    return {
      delayMins: departureDelay,
      status: departureDelay > 0 ? "Delayed" : "On time",
      basis: "departure",
    };
  }

  return { delayMins: null, status: "Unknown", basis: "unknown" };
}
