function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value.trim();
}

function assertNullableString(value, label) {
  if (value === null || value === undefined) {
    return null;
  }

  return assertString(value, label);
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }

  return value;
}

function assertNullableNonNegativeInteger(value, label) {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer or null`);
  }

  return value;
}

function assertIsoDate(value, label) {
  const normalized = assertString(value, label);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${label} must be in YYYY-MM-DD format`);
  }

  return normalized;
}

function assertNullableIsoTimestamp(value, label) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = assertString(value, label);

  if (Number.isNaN(Date.parse(normalized))) {
    throw new Error(`${label} must be a valid ISO timestamp or null`);
  }

  return normalized;
}

function normalizeCrs(value, label) {
  const normalized = assertString(value, label).toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error(`${label} must be a 3-letter CRS code`);
  }

  return normalized;
}

function normalizeTocCode(value, label) {
  const normalized = assertString(value, label).toUpperCase();

  if (!/^[A-Z]{2}$/.test(normalized)) {
    throw new Error(`${label} must be a 2-letter TOC code`);
  }

  return normalized;
}

function normalizeHhmm(value, label) {
  const normalized = assertString(value, label);

  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    throw new Error(`${label} must be in HH:mm format`);
  }

  const [hours, minutes] = normalized.split(":").map(Number);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`${label} must be a valid 24-hour clock time`);
  }

  return normalized;
}

function combineServiceDateAndTime(serviceDate, hhmm) {
  const [year, month, day] = serviceDate.split("-").map(Number);
  const [hours, minutes] = hhmm.split(":").map(Number);

  return new Date(Date.UTC(year, month - 1, day, hours, minutes, 0)).toISOString();
}

function normalizeStop(stop, index, serviceLabel) {
  const label = `${serviceLabel}.stops[${index}]`;
  assertObject(stop, label);

  const arrivalTime =
    stop.gbttBookedArrival === null || stop.gbttBookedArrival === undefined
      ? null
      : normalizeHhmm(stop.gbttBookedArrival, `${label}.gbttBookedArrival`);
  const departureTime =
    stop.gbttBookedDeparture === null || stop.gbttBookedDeparture === undefined
      ? null
      : normalizeHhmm(stop.gbttBookedDeparture, `${label}.gbttBookedDeparture`);

  if (!arrivalTime && !departureTime) {
    throw new Error(
      `${label} must include gbttBookedArrival, gbttBookedDeparture, or both`,
    );
  }

  return {
    crs: normalizeCrs(stop.crs, `${label}.crs`),
    arrivalTime,
    departureTime,
  };
}

function parseTimetableRecord(input, index) {
  const label = `timetable sample record at index ${index}`;
  assertObject(input, label);
  assertObject(input.serviceIdentifier, `${label}.serviceIdentifier`);
  assertObject(input.serviceStatus, `${label}.serviceStatus`);
  assertObject(input.realtime, `${label}.realtime`);
  assertObject(input.quality, `${label}.quality`);

  if (!Array.isArray(input.stops) || input.stops.length < 2) {
    throw new Error(`${label}.stops must contain at least two calling points`);
  }

  return {
    serviceDate: assertIsoDate(input.serviceDate, `${label}.serviceDate`),
    tocCode: normalizeTocCode(input.tocCode, `${label}.tocCode`),
    serviceIdentifier: {
      trainUid: assertString(
        input.serviceIdentifier.trainUid,
        `${label}.serviceIdentifier.trainUid`,
      ),
      rid: assertNullableString(
        input.serviceIdentifier.rid,
        `${label}.serviceIdentifier.rid`,
      ),
    },
    serviceStatus: {
      state: assertString(input.serviceStatus.state, `${label}.serviceStatus.state`),
      cancelled: assertBoolean(
        input.serviceStatus.cancelled,
        `${label}.serviceStatus.cancelled`,
      ),
      partCancelled: assertBoolean(
        input.serviceStatus.partCancelled,
        `${label}.serviceStatus.partCancelled`,
      ),
      delayMinutes: assertNullableNonNegativeInteger(
        input.serviceStatus.delayMinutes,
        `${label}.serviceStatus.delayMinutes`,
      ),
    },
    realtime: {
      originDeparture: assertNullableIsoTimestamp(
        input.realtime.originDeparture,
        `${label}.realtime.originDeparture`,
      ),
      destinationArrival: assertNullableIsoTimestamp(
        input.realtime.destinationArrival,
        `${label}.realtime.destinationArrival`,
      ),
    },
    quality: {
      score: assertNullableNonNegativeInteger(
        input.quality.score,
        `${label}.quality.score`,
      ),
    },
    stops: input.stops.map((stop, stopIndex) =>
      normalizeStop(stop, stopIndex, label),
    ),
  };
}

function toCanonicalHistoricalRecord(record) {
  const originStop = record.stops[0];
  const destinationStop = record.stops[record.stops.length - 1];

  if (!originStop.departureTime) {
    throw new Error(
      `Service ${record.serviceIdentifier.trainUid} must have a departure time at the origin stop`,
    );
  }

  if (!destinationStop.arrivalTime) {
    throw new Error(
      `Service ${record.serviceIdentifier.trainUid} must have an arrival time at the destination stop`,
    );
  }

  return {
    serviceKey: [
      record.serviceDate,
      record.tocCode,
      record.serviceIdentifier.trainUid,
      originStop.crs,
      destinationStop.crs,
    ].join(":"),
    serviceDate: record.serviceDate,
    trainUid: record.serviceIdentifier.trainUid,
    rid: record.serviceIdentifier.rid,
    tocCode: record.tocCode,
    originCrs: originStop.crs,
    destinationCrs: destinationStop.crs,
    scheduledDepartureOrigin: combineServiceDateAndTime(
      record.serviceDate,
      originStop.departureTime,
    ),
    scheduledArrivalDestination: combineServiceDateAndTime(
      record.serviceDate,
      destinationStop.arrivalTime,
    ),
    actualDepartureOrigin: record.realtime.originDeparture,
    actualArrivalDestination: record.realtime.destinationArrival,
    status: record.serviceStatus.state,
    isCancelled: record.serviceStatus.cancelled,
    isPartCancelled: record.serviceStatus.partCancelled,
    delayMinutes: record.serviceStatus.delayMinutes,
    dataQualityScore: record.quality.score,
  };
}

export function mapTimetableRecordsToCanonicalHistorical(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Timetable sample file must contain a non-empty array");
  }

  return records.map((item, index) =>
    toCanonicalHistoricalRecord(parseTimetableRecord(item, index)),
  );
}
