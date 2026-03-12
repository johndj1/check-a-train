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

export const OPERATORS: Record<OperatorCode, DelayRepayOperator> = {
  AW: {
    code: "AW",
    name: "Transport for Wales",
    delayRepayUrl: "https://tfw.wales/help-and-contact/delay-repay",
    minDelayMins: 15,
    aliases: ["TfW", "Transport for Wales Rail"],
  },
  CC: {
    code: "CC",
    name: "c2c",
    delayRepayUrl: "https://www.c2c-online.co.uk/help_centre/delay-repay/",
    minDelayMins: 15,
  },
  CH: {
    code: "CH",
    name: "Chiltern Railways",
    delayRepayUrl: "https://www.chilternrailways.co.uk/delay-repay",
    minDelayMins: 15,
    aliases: ["Chiltern"],
  },
  CS: {
    code: "CS",
    name: "Caledonian Sleeper",
    delayRepayUrl: "https://www.sleeper.scot/guest-service/delay-repay/",
    minDelayMins: 15,
  },
  EM: {
    code: "EM",
    name: "East Midlands Railway",
    delayRepayUrl: "https://www.eastmidlandsrailway.co.uk/help-manage/help/delay-repay",
    minDelayMins: 15,
    aliases: ["EMR"],
  },
  GC: {
    code: "GC",
    name: "Grand Central",
    delayRepayUrl: "https://www.grandcentralrail.com/help/delay-repay",
    minDelayMins: 15,
  },
  GN: {
    code: "GN",
    name: "Great Northern",
    delayRepayUrl: "https://www.greatnorthernrail.com/help-and-support/delay-repay",
    minDelayMins: 15,
  },
  GR: {
    code: "GR",
    name: "LNER",
    delayRepayUrl: "https://www.lner.co.uk/support/refunds-and-compensation/delay-repay/",
    minDelayMins: 15,
    aliases: ["London North Eastern Railway"],
  },
  GW: {
    code: "GW",
    name: "Great Western Railway",
    delayRepayUrl: "https://www.gwr.com/help-and-support/refunds-and-compensation/delay-repay",
    minDelayMins: 15,
    aliases: ["GWR"],
  },
  GX: {
    code: "GX",
    name: "Gatwick Express",
    delayRepayUrl: "https://www.gatwickexpress.com/help-and-support/delay-repay",
    minDelayMins: 15,
  },
  HT: {
    code: "HT",
    name: "Hull Trains",
    delayRepayUrl: "https://www.hulltrains.co.uk/help-support/delay-repay",
    minDelayMins: 15,
  },
  HX: {
    code: "HX",
    name: "Heathrow Express",
    delayRepayUrl: "https://www.heathrowexpress.com/help-and-support/delays-and-disruptions",
    minDelayMins: 15,
  },
  LE: {
    code: "LE",
    name: "Greater Anglia",
    delayRepayUrl: "https://www.greateranglia.co.uk/help-and-advice/getting-help/delay-repay",
    minDelayMins: 15,
  },
  LM: {
    code: "LM",
    name: "London Northwestern Railway",
    delayRepayUrl: "https://www.londonnorthwesternrailway.co.uk/about-us/delay-repay",
    minDelayMins: 15,
    aliases: ["West Midlands Trains"],
  },
  ME: {
    code: "ME",
    name: "Merseyrail",
    delayRepayUrl: "https://www.merseyrail.org/help-and-support/delay-repay/",
    minDelayMins: 15,
  },
  NT: {
    code: "NT",
    name: "Northern",
    delayRepayUrl: "https://www.northernrailway.co.uk/help/delay-repay",
    minDelayMins: 15,
  },
  SE: {
    code: "SE",
    name: "Southeastern",
    delayRepayUrl: "https://www.southeasternrailway.co.uk/delay-repay",
    minDelayMins: 15,
  },
  SN: {
    code: "SN",
    name: "Southern",
    delayRepayUrl: "https://www.southernrailway.com/help-and-support/delay-repay",
    minDelayMins: 15,
  },
  SR: {
    code: "SR",
    name: "ScotRail",
    delayRepayUrl: "https://www.scotrail.co.uk/help-and-support/refunds-and-compensation/delay-repay",
    minDelayMins: 15,
  },
  SW: {
    code: "SW",
    name: "South Western Railway",
    delayRepayUrl: "https://www.southwesternrailway.com/contact-and-help/delay-repay",
    minDelayMins: 15,
    aliases: ["SWR"],
  },
  TL: {
    code: "TL",
    name: "Thameslink",
    delayRepayUrl: "https://www.thameslinkrailway.com/help-and-support/delay-repay",
    minDelayMins: 15,
  },
  TP: {
    code: "TP",
    name: "TransPennine Express",
    delayRepayUrl: "https://www.tpexpress.co.uk/help/delay-repay",
    minDelayMins: 15,
    aliases: ["TPE"],
  },
  VT: {
    code: "VT",
    name: "Avanti West Coast",
    delayRepayUrl: "https://www.avantiwestcoast.co.uk/help-and-support/delay-repay",
    minDelayMins: 15,
    aliases: ["Avanti"],
  },
  WM: {
    code: "WM",
    name: "West Midlands Railway",
    delayRepayUrl: "https://www.westmidlandsrailway.co.uk/about-us/delay-repay",
    minDelayMins: 15,
    aliases: ["WMR"],
  },
  XC: {
    code: "XC",
    name: "CrossCountry",
    delayRepayUrl: "https://www.crosscountrytrains.co.uk/customer-service/complaints-and-compensation/delay-repay",
    minDelayMins: 15,
  },
};

function normalizeOperatorKey(value: string | null | undefined) {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const OPERATORS_BY_NAME = Object.values(OPERATORS).reduce<Record<string, DelayRepayOperator>>(
  (acc, operator) => {
    acc[normalizeOperatorKey(operator.name)] = operator;

    for (const alias of operator.aliases ?? []) {
      acc[normalizeOperatorKey(alias)] = operator;
    }

    return acc;
  },
  {},
);

export function getOperator(
  code: string | null | undefined,
  fallbackName?: string | null | undefined,
) {
  const normalizedCode = code?.trim().toUpperCase();
  if (normalizedCode && OPERATORS[normalizedCode]) {
    return OPERATORS[normalizedCode];
  }

  const fallback = normalizeOperatorKey(fallbackName);
  if (fallback) {
    return OPERATORS_BY_NAME[fallback] ?? null;
  }

  return null;
}

export function resolveDelayRepayOperator(service: DelayRepayServiceOperatorInput) {
  return getOperator(service.operator, service.operatorName);
}

export function resolveDelayRepayClaimUrl(service: DelayRepayServiceOperatorInput) {
  return resolveDelayRepayOperator(service)?.delayRepayUrl ?? null;
}
