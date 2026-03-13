import { getSupabaseServerConfigFromEnv, supabaseRestRequest } from "../supabase/rest.mjs";

export const DEFAULT_HISTORICAL_SEARCH_WINDOW_MINS = 30;
export const DEFAULT_HISTORICAL_SEARCH_LIMIT = 5;
const DEFAULT_DATABASE_RESULT_LIMIT = 25;

function assertString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value.trim();
}

function normalizeCrs(value, label) {
  const normalized = assertString(value, label).toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error(`${label} must be a 3-letter CRS code`);
  }

  return normalized;
}

function normalizeServiceDate(value) {
  const normalized = assertString(value, "serviceDate");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);

  if (!match) {
    throw new Error("serviceDate must be in YYYY-MM-DD format");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("serviceDate must be a valid calendar date");
  }

  return normalized;
}

function normalizeApproxDepartureTime(value) {
  const normalized = assertString(value, "approxDepartureTime");
  const match = /^(\d{2}):(\d{2})$/.exec(normalized);

  if (!match) {
    throw new Error("approxDepartureTime must be in HH:mm format");
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error("approxDepartureTime must be a valid 24-hour clock time");
  }

  return normalized;
}

function normalizeWindowMinutes(value) {
  if (value === undefined) {
    return DEFAULT_HISTORICAL_SEARCH_WINDOW_MINS;
  }

  if (!Number.isInteger(value) || value < 0 || value > 180) {
    throw new Error("windowMinutes must be an integer between 0 and 180");
  }

  return value;
}

function normalizeLimit(value) {
  if (value === undefined) {
    return DEFAULT_HISTORICAL_SEARCH_LIMIT;
  }

  if (!Number.isInteger(value) || value < 1 || value > 20) {
    throw new Error("limit must be an integer between 1 and 20");
  }

  return value;
}

function hhmmToMinutes(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

function dateAndMinutesToIsoUtc(serviceDate, totalMinutes) {
  const [year, month, day] = serviceDate.split("-").map(Number);
  const timestamp = new Date(Date.UTC(year, month - 1, day, 0, totalMinutes, 0));
  return timestamp.toISOString();
}

function buildSearchWindow(serviceDate, approxDepartureTime, windowMinutes) {
  const requestedMinutes = hhmmToMinutes(approxDepartureTime);

  return {
    requestedDepartureTs: dateAndMinutesToIsoUtc(serviceDate, requestedMinutes),
    windowStartTs: dateAndMinutesToIsoUtc(serviceDate, requestedMinutes - windowMinutes),
    windowEndTs: dateAndMinutesToIsoUtc(serviceDate, requestedMinutes + windowMinutes),
  };
}

function buildQueryParams(normalizedQuery, databaseResultLimit) {
  const queryParams = new URLSearchParams();

  queryParams.set(
    "select",
    [
      "service_id",
      "service_date",
      "origin_crs",
      "destination_crs",
      "scheduled_departure_ts",
      "scheduled_arrival_ts",
      "toc_code",
      "status",
      "is_cancelled",
      "delay_minutes",
    ].join(","),
  );
  queryParams.set("service_date", `eq.${normalizedQuery.serviceDate}`);
  queryParams.set("origin_crs", `eq.${normalizedQuery.originCrs}`);
  queryParams.set("destination_crs", `eq.${normalizedQuery.destinationCrs}`);
  queryParams.append(
    "scheduled_departure_ts",
    `gte.${normalizedQuery.windowStartTs}`,
  );
  queryParams.append(
    "scheduled_departure_ts",
    `lte.${normalizedQuery.windowEndTs}`,
  );
  queryParams.set("order", "scheduled_departure_ts.asc");
  queryParams.set("limit", String(databaseResultLimit));

  return queryParams;
}

function rankCandidates(rows, requestedDepartureTs, limit) {
  const requestedDepartureMs = Date.parse(requestedDepartureTs);

  return rows
    .map((row) => {
      const scheduledDepartureMs = Date.parse(row.scheduled_departure_ts);
      const departureDeltaMinutes = Math.round(
        Math.abs(scheduledDepartureMs - requestedDepartureMs) / 60000,
      );

      return {
        serviceId: row.service_id,
        serviceDate: row.service_date,
        originCrs: row.origin_crs,
        destinationCrs: row.destination_crs,
        scheduledDepartureTs: row.scheduled_departure_ts,
        scheduledArrivalTs: row.scheduled_arrival_ts,
        tocCode: row.toc_code,
        status: row.status,
        isCancelled: row.is_cancelled,
        delayMinutes: row.delay_minutes,
        departureDeltaMinutes,
      };
    })
    .sort((a, b) => {
      if (a.departureDeltaMinutes !== b.departureDeltaMinutes) {
        return a.departureDeltaMinutes - b.departureDeltaMinutes;
      }

      const scheduledDepartureCompare =
        Date.parse(a.scheduledDepartureTs) - Date.parse(b.scheduledDepartureTs);
      if (scheduledDepartureCompare !== 0) {
        return scheduledDepartureCompare;
      }

      return a.serviceId.localeCompare(b.serviceId);
    })
    .slice(0, limit);
}

function normalizeSearchInput(input, options) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("search input must be an object");
  }

  const originCrs = normalizeCrs(input.originCrs, "originCrs");
  const destinationCrs = normalizeCrs(input.destinationCrs, "destinationCrs");
  const serviceDate = normalizeServiceDate(input.serviceDate);
  const approxDepartureTime = normalizeApproxDepartureTime(input.approxDepartureTime);
  const windowMinutes = normalizeWindowMinutes(options?.windowMinutes);
  const limit = normalizeLimit(options?.limit);
  const searchWindow = buildSearchWindow(serviceDate, approxDepartureTime, windowMinutes);

  return {
    originCrs,
    destinationCrs,
    serviceDate,
    approxDepartureTime,
    windowMinutes,
    limit,
    ...searchWindow,
  };
}

export async function searchHistoricalServices(input, options = {}) {
  const normalizedQuery = normalizeSearchInput(input, options);
  const databaseResultLimit = Math.max(
    normalizedQuery.limit,
    options.databaseResultLimit ?? DEFAULT_DATABASE_RESULT_LIMIT,
  );
  const rows = await supabaseRestRequest({
    ...getSupabaseServerConfigFromEnv(),
    method: "GET",
    table: "historical_service_search",
    queryParams: buildQueryParams(normalizedQuery, databaseResultLimit),
  });

  const candidates = rankCandidates(
    Array.isArray(rows) ? rows : [],
    normalizedQuery.requestedDepartureTs,
    normalizedQuery.limit,
  );

  return {
    query: {
      originCrs: normalizedQuery.originCrs,
      destinationCrs: normalizedQuery.destinationCrs,
      serviceDate: normalizedQuery.serviceDate,
      approxDepartureTime: normalizedQuery.approxDepartureTime,
      windowMinutes: normalizedQuery.windowMinutes,
      searchWindowStartTs: normalizedQuery.windowStartTs,
      searchWindowEndTs: normalizedQuery.windowEndTs,
    },
    candidates,
  };
}
