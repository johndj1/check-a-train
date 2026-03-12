export type OperatorClaimLink = {
  code: string;
  name: string;
  url: string;
  aliases?: string[];
};

export const OPERATOR_CLAIM_LINKS: Record<string, OperatorClaimLink> = {
  AW: {
    code: "AW",
    name: "Transport for Wales",
    url: "https://tfw.wales/help-and-contact/delay-repay",
    aliases: ["TfW", "Transport for Wales Rail"],
  },
  CC: {
    code: "CC",
    name: "c2c",
    url: "https://www.c2c-online.co.uk/help_centre/delay-repay/",
  },
  CH: {
    code: "CH",
    name: "Chiltern Railways",
    url: "https://www.chilternrailways.co.uk/delay-repay",
    aliases: ["Chiltern"],
  },
  CS: {
    code: "CS",
    name: "Caledonian Sleeper",
    url: "https://www.sleeper.scot/guest-service/delay-repay/",
  },
  EM: {
    code: "EM",
    name: "East Midlands Railway",
    url: "https://www.eastmidlandsrailway.co.uk/help-manage/help/delay-repay",
    aliases: ["EMR"],
  },
  GC: {
    code: "GC",
    name: "Grand Central",
    url: "https://www.grandcentralrail.com/help/delay-repay",
  },
  GN: {
    code: "GN",
    name: "Great Northern",
    url: "https://www.greatnorthernrail.com/help-and-support/delay-repay",
  },
  GR: {
    code: "GR",
    name: "LNER",
    url: "https://www.lner.co.uk/support/refunds-and-compensation/delay-repay/",
    aliases: ["London North Eastern Railway"],
  },
  GW: {
    code: "GW",
    name: "Great Western Railway",
    url: "https://www.gwr.com/help-and-support/refunds-and-compensation/delay-repay",
    aliases: ["GWR"],
  },
  GX: {
    code: "GX",
    name: "Gatwick Express",
    url: "https://www.gatwickexpress.com/help-and-support/delay-repay",
  },
  HT: {
    code: "HT",
    name: "Hull Trains",
    url: "https://www.hulltrains.co.uk/help-support/delay-repay",
  },
  HX: {
    code: "HX",
    name: "Heathrow Express",
    url: "https://www.heathrowexpress.com/help-and-support/delays-and-disruptions",
  },
  LE: {
    code: "LE",
    name: "Greater Anglia",
    url: "https://www.greateranglia.co.uk/help-and-advice/getting-help/delay-repay",
  },
  LM: {
    code: "LM",
    name: "London Northwestern Railway",
    url: "https://www.londonnorthwesternrailway.co.uk/about-us/delay-repay",
    aliases: ["West Midlands Trains"],
  },
  ME: {
    code: "ME",
    name: "Merseyrail",
    url: "https://www.merseyrail.org/help-and-support/delay-repay/",
  },
  NT: {
    code: "NT",
    name: "Northern",
    url: "https://www.northernrailway.co.uk/help/delay-repay",
  },
  SE: {
    code: "SE",
    name: "Southeastern",
    url: "https://www.southeasternrailway.co.uk/delay-repay",
  },
  SN: {
    code: "SN",
    name: "Southern",
    url: "https://www.southernrailway.com/help-and-support/delay-repay",
  },
  SR: {
    code: "SR",
    name: "ScotRail",
    url: "https://www.scotrail.co.uk/help-and-support/refunds-and-compensation/delay-repay",
  },
  SW: {
    code: "SW",
    name: "South Western Railway",
    url: "https://www.southwesternrailway.com/contact-and-help/delay-repay",
    aliases: ["SWR"],
  },
  TL: {
    code: "TL",
    name: "Thameslink",
    url: "https://www.thameslinkrailway.com/help-and-support/delay-repay",
  },
  TP: {
    code: "TP",
    name: "TransPennine Express",
    url: "https://www.tpexpress.co.uk/help/delay-repay",
    aliases: ["TPE"],
  },
  VT: {
    code: "VT",
    name: "Avanti West Coast",
    url: "https://www.avantiwestcoast.co.uk/help-and-support/delay-repay",
    aliases: ["Avanti"],
  },
  WM: {
    code: "WM",
    name: "West Midlands Railway",
    url: "https://www.westmidlandsrailway.co.uk/about-us/delay-repay",
    aliases: ["WMR"],
  },
  XC: {
    code: "XC",
    name: "CrossCountry",
    url: "https://www.crosscountrytrains.co.uk/customer-service/complaints-and-compensation/delay-repay",
  },
};

function normalizeOperatorKey(value: string | null | undefined) {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const OPERATOR_CLAIM_LINKS_BY_NAME = Object.values(OPERATOR_CLAIM_LINKS).reduce<
  Record<string, OperatorClaimLink>
>((acc, operator) => {
  acc[normalizeOperatorKey(operator.name)] = operator;

  for (const alias of operator.aliases ?? []) {
    acc[normalizeOperatorKey(alias)] = operator;
  }

  return acc;
}, {});

export function getOperatorClaimLink(
  code: string | null | undefined,
  fallbackName?: string | null | undefined,
) {
  const normalizedCode = code?.trim().toUpperCase();
  if (normalizedCode && OPERATOR_CLAIM_LINKS[normalizedCode]) {
    return OPERATOR_CLAIM_LINKS[normalizedCode];
  }

  const fallback = normalizeOperatorKey(fallbackName);
  if (fallback) {
    return OPERATOR_CLAIM_LINKS_BY_NAME[fallback] ?? null;
  }

  return null;
}

export function resolveOperatorClaimUrl(
  code: string | null | undefined,
  fallbackName?: string | null | undefined,
) {
  return getOperatorClaimLink(code, fallbackName)?.url ?? null;
}
