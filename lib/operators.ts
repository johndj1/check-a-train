import { getOperatorClaimLink, resolveOperatorClaimUrl } from "@/lib/operators/claim-links";

export type OperatorCode = string;

export type DelayRepayOperator = {
  code: OperatorCode;
  name: string;
  delayRepayUrl: string;
  minDelayMins: number;
  aliases?: string[];
};

export type DelayRepayServiceOperatorInput = {
  operator?: string | null;
  operatorName?: string | null;
};

export function getOperator(
  code: string | null | undefined,
  fallbackName?: string | null | undefined,
): DelayRepayOperator | null {
  const operator = getOperatorClaimLink(code, fallbackName);
  if (!operator) return null;

  return {
    code: operator.code,
    name: operator.name,
    delayRepayUrl: operator.url,
    minDelayMins: 15,
    aliases: operator.aliases,
  };
}

export function resolveDelayRepayOperator(service: DelayRepayServiceOperatorInput) {
  return getOperator(service.operator, service.operatorName);
}

export function resolveDelayRepayClaimUrl(service: DelayRepayServiceOperatorInput) {
  return resolveOperatorClaimUrl(service.operator, service.operatorName);
}
