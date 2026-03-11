export type DarwinNormalizedService = {
  uid: string;
  operator: string | null;
  operatorName: string;
  platform: string | null;
  originName: string;
  destinationName: string;
  aimedDeparture: string | null;
  expectedDeparture: string | null;
  aimedArrival: string | "";
  expectedArrival: string | null;
  delayMins: number | null;
  status: "On time" | "Delayed" | "Cancelled" | "Unknown";
  callsAtTo?: boolean;
  rawStatusText?: string | null;
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
  detailsLimit?: number;
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
