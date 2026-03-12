export type DelayRepayEligibilityBand = "eligible" | "below_threshold" | "unknown_delay";

export type DelayRepayEligibility = {
  isEligible: boolean;
  eligibilityReason: string;
  eligibilityBand: DelayRepayEligibilityBand;
};

type DelayRepayEligibilityInput = {
  delayMins: number | null | undefined;
};

const DELAY_REPAY_THRESHOLD_MINS = 15;

export function deriveDelayRepayEligibility(
  input: DelayRepayEligibilityInput,
): DelayRepayEligibility {
  if (typeof input.delayMins !== "number") {
    return {
      isEligible: false,
      eligibilityBand: "unknown_delay",
      eligibilityReason: "Not eligible yet",
    };
  }

  if (input.delayMins >= DELAY_REPAY_THRESHOLD_MINS) {
    return {
      isEligible: true,
      eligibilityBand: "eligible",
      eligibilityReason: `Eligible for Delay Repay at ${input.delayMins} minutes delayed`,
    };
  }

  return {
    isEligible: false,
    eligibilityBand: "below_threshold",
    eligibilityReason: "Delay below Delay Repay threshold",
  };
}
