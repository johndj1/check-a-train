export type ServiceStatus = "On time" | "Delayed" | "Cancelled" | "Unknown";

export type DarwinStatusBasis = "arrival" | "departure" | "raw_status" | "unknown";

export type DarwinStatusConfidence = "high" | "medium" | "low";

export type DarwinFirstPassStatus = {
  status: ServiceStatus;
  delayMins: number | null;
  basis: DarwinStatusBasis;
  confidence: DarwinStatusConfidence;
  matchedServiceUid: string | null;
};

export type DarwinMatchingDiagnostics = {
  requestedTime: string;
  windowMins: number;
  rawServiceCount: number;
  normalizedServiceCount: number;
  afterTimeWindowCount: number;
  afterDestinationFilterCount: number;
  candidateCount: number;
  excludedMissingFilterTime: number;
  excludedOutsideWindow: number;
  destinationConfirmedCount: number;
  destinationMismatchCount: number;
  destinationUnknownCount: number;
  normalizedServiceSample: Array<{
    uid: string;
    destinationName: string;
    aimedDeparture: string | null;
    expectedDeparture: string | null;
    callsAtTo: boolean | null;
  }>;
  sampleExclusions: Array<{
    uid: string;
    reason: "missing_filter_time" | "outside_window";
    filterTime: string | null;
    callsAtTo: boolean | null;
    destinationName: string;
  }>;
};

export type DarwinNormalizedService = {
  uid: string;
  operator: string | null;
  operatorName: string;
  claimUrl: string | null;
  platform: string | null;
  originName: string;
  destinationName: string;
  aimedDeparture: string | null;
  expectedDeparture: string | null;
  aimedArrival: string | "";
  expectedArrival: string | null;
  delayMins: number | null;
  status: ServiceStatus;
  callsAtTo?: boolean;
  rawStatusText?: string | null;
  matchScore?: number;
  isBestMatch?: boolean;
  statusBasis?: DarwinStatusBasis;
  statusConfidence?: DarwinStatusConfidence;
  _timetableId?: string | null;
};

export type DarwinFixtureFetchParams = {
  from: string;
  to: string;
  date: string;
  time: string;
  windowMins?: number;
};

export type HspDayType = "WEEKDAY" | "SATURDAY" | "SUNDAY";

export type HspServicesParams = {
  from: string;
  to: string;
  date: string;
  time: string;
  windowMins: number;
};

export type HspServiceMetricsRequest = {
  from_loc: string;
  to_loc: string;
  from_time: string;
  to_time: string;
  from_date: string;
  to_date: string;
  days: HspDayType;
  toc_filter?: string;
  tolerance?: number;
};
