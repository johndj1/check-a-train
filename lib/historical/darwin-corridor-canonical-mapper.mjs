function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertNonEmptyArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
}

function normalizeNullableString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function normalizeIsoDate(value) {
  const normalized = normalizeNullableString(value);
  return normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function normalizeHhmm(value) {
  const normalized = normalizeNullableString(value);

  if (!normalized || !/^\d{2}:\d{2}$/.test(normalized)) {
    return null;
  }

  const [hours, minutes] = normalized.split(":").map(Number);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return normalized;
}

function normalizeCrs(value) {
  const normalized = normalizeNullableString(value);
  return normalized && /^[A-Za-z]{3}$/.test(normalized)
    ? normalized.toUpperCase()
    : null;
}

function normalizeTocCode(value) {
  const normalized = normalizeNullableString(value);
  return normalized && /^[A-Za-z]{2}$/.test(normalized)
    ? normalized.toUpperCase()
    : null;
}

function combineServiceDateAndTime(serviceDate, hhmm) {
  const [year, month, day] = serviceDate.split("-").map(Number);
  const [hours, minutes] = hhmm.split(":").map(Number);

  return new Date(Date.UTC(year, month - 1, day, hours, minutes, 0)).toISOString();
}

function hhmmToMinutes(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

function buildExclusion(service, reason) {
  const stops = Array.isArray(service?.stops) ? service.stops : [];
  const originStop = stops[0] ?? null;
  const destinationStop = stops[stops.length - 1] ?? null;

  return {
    reason,
    serviceDate: normalizeNullableString(service?.ssd),
    trainUid: normalizeNullableString(service?.uid),
    rid: normalizeNullableString(service?.rid),
    tocCode: normalizeNullableString(service?.toc),
    originTiploc: normalizeNullableString(originStop?.tiploc),
    destinationTiploc: normalizeNullableString(destinationStop?.tiploc),
    originCrs: normalizeCrs(originStop?.resolvedCrs),
    destinationCrs: normalizeCrs(destinationStop?.resolvedCrs),
  };
}

function calculateDataQualityScore(service, hasRid) {
  const stops = service.stops;
  const resolvedStopCount = stops.filter(
    (stop) => normalizeCrs(stop?.resolvedCrs) !== null,
  ).length;
  const resolvedStopRatio = resolvedStopCount / stops.length;

  return 60 + (hasRid ? 10 : 0) + Math.round(resolvedStopRatio * 30);
}

export function mapDarwinCorridorServiceToCanonical(service) {
  assertObject(service, "service");

  const stops = Array.isArray(service.stops) ? service.stops : [];

  if (stops.length < 2) {
    return {
      eligible: false,
      exclusion: buildExclusion(service, "insufficient_stops"),
    };
  }

  const serviceDate = normalizeIsoDate(service.ssd);

  if (!serviceDate) {
    return {
      eligible: false,
      exclusion: buildExclusion(service, "invalid_service_date"),
    };
  }

  const trainUid = normalizeNullableString(service.uid);

  if (!trainUid) {
    return {
      eligible: false,
      exclusion: buildExclusion(service, "missing_service_identifier"),
    };
  }

  const tocCode = normalizeTocCode(service.toc);

  if (!tocCode) {
    return {
      eligible: false,
      exclusion: buildExclusion(service, "missing_toc_code"),
    };
  }

  const originStop = stops[0];
  const destinationStop = stops[stops.length - 1];
  const originCrs = normalizeCrs(originStop?.resolvedCrs);
  const destinationCrs = normalizeCrs(destinationStop?.resolvedCrs);

  if (!originCrs) {
    return {
      eligible: false,
      exclusion: buildExclusion(service, "missing_resolved_origin"),
    };
  }

  if (!destinationCrs) {
    return {
      eligible: false,
      exclusion: buildExclusion(service, "missing_resolved_destination"),
    };
  }

  const scheduledDeparture = normalizeHhmm(originStop?.scheduledDeparture);

  if (!scheduledDeparture) {
    return {
      eligible: false,
      exclusion: buildExclusion(service, "missing_scheduled_departure"),
    };
  }

  const scheduledArrival = normalizeHhmm(destinationStop?.scheduledArrival);

  if (!scheduledArrival) {
    return {
      eligible: false,
      exclusion: buildExclusion(service, "missing_scheduled_arrival"),
    };
  }

  if (hhmmToMinutes(scheduledArrival) < hhmmToMinutes(scheduledDeparture)) {
    return {
      eligible: false,
      exclusion: buildExclusion(service, "overnight_not_supported"),
    };
  }

  const rid = normalizeNullableString(service.rid);
  const scheduledDepartureOrigin = combineServiceDateAndTime(
    serviceDate,
    scheduledDeparture,
  );
  const scheduledArrivalDestination = combineServiceDateAndTime(
    serviceDate,
    scheduledArrival,
  );

  const canonicalService = {
    serviceKey: [serviceDate, tocCode, trainUid, originCrs, destinationCrs].join(":"),
    serviceDate,
    trainUid,
    rid,
    tocCode,
    originCrs,
    destinationCrs,
    scheduledDepartureOrigin,
    scheduledArrivalDestination,
    actualDepartureOrigin: null,
    actualArrivalDestination: null,
    status: "scheduled",
    isCancelled: false,
    isPartCancelled: false,
    delayMinutes: null,
    dataQualityScore: calculateDataQualityScore(service, rid !== null),
  };

  const searchRow = {
    serviceDate,
    originCrs,
    destinationCrs,
    scheduledDepartureTs: scheduledDepartureOrigin,
    scheduledArrivalTs: scheduledArrivalDestination,
    tocCode,
    status: "scheduled",
    isCancelled: false,
    delayMinutes: null,
  };

  return {
    eligible: true,
    service: canonicalService,
    searchRow,
  };
}

export function mapDarwinCorridorSubsetToCanonicalInspection(input) {
  assertObject(input, "corridor input");
  assertNonEmptyArray(input.services, "corridor input.services");

  const services = [];
  const searchRows = [];
  const exclusions = [];

  for (const service of input.services) {
    const mapped = mapDarwinCorridorServiceToCanonical(service);

    if (mapped.eligible) {
      services.push(mapped.service);
      searchRows.push(mapped.searchRow);
      continue;
    }

    exclusions.push(mapped.exclusion);
  }

  return {
    sourceFile: normalizeNullableString(input.sourceFile),
    corridor: normalizeNullableString(input.corridor),
    servicesConsidered: input.services.length,
    eligibleServiceCount: services.length,
    excludedServiceCount: exclusions.length,
    services,
    searchRows,
    exclusions,
  };
}
