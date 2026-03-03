export type OperatorCode = string;

export type DelayRepayOperator = {
  code: OperatorCode;          // e.g. "SE", "TL"
  name: string;                // e.g. "Southeastern"
  delayRepayUrl: string;       // operator’s claim page
  minDelayMins: number;        // typical threshold (often 15, varies)
};

export const OPERATORS: Record<OperatorCode, DelayRepayOperator> = {
  SE: {
    code: "SE",
    name: "Southeastern",
    delayRepayUrl: "https://www.southeasternrailway.co.uk/delay-repay",
    minDelayMins: 15,
  },
  TL: {
    code: "TL",
    name: "Thameslink",
    delayRepayUrl: "https://www.thameslinkrailway.com/help-and-support/delay-repay",
    minDelayMins: 15,
  },
};

// Helper so UI doesn’t explode when we don’t know the operator yet
export function getOperator(code: string | null | undefined) {
  if (!code) return null;
  return OPERATORS[code] ?? null;
}