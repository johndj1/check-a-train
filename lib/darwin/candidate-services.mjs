const PASSENGER_STOP_KINDS = new Set(["OR", "IP", "DT"]);

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertNullableString(value, label) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${label} must be a string or null`);
  }

  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function assertNullableBoolean(value, label) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean or null`);
  }

  return value;
}

function normalizeStop(point, journeyIndex, pointIndex) {
  const label = `journeys[${journeyIndex}].timingPoints[${pointIndex}]`;
  assertObject(point, label);

  const kind = assertNullableString(point.kind, `${label}.kind`);

  if (!kind || !PASSENGER_STOP_KINDS.has(kind)) {
    return null;
  }

  return {
    kind,
    tiploc: assertNullableString(point.tiploc, `${label}.tiploc`),
    scheduledArrival: assertNullableString(
      point.scheduledArrival,
      `${label}.scheduledArrival`,
    ),
    scheduledDeparture: assertNullableString(
      point.scheduledDeparture,
      `${label}.scheduledDeparture`,
    ),
  };
}

function normalizeJourney(journey, index) {
  const label = `journeys[${index}]`;
  assertObject(journey, label);

  const isPassengerSvc = assertNullableBoolean(
    journey.isPassengerSvc,
    `${label}.isPassengerSvc`,
  );

  if (isPassengerSvc === false) {
    return null;
  }

  if (!Array.isArray(journey.timingPoints)) {
    throw new Error(`${label}.timingPoints must be an array`);
  }

  const stops = journey.timingPoints
    .map((point, pointIndex) => normalizeStop(point, index, pointIndex))
    .filter(Boolean);

  return {
    rid: assertNullableString(journey.rid, `${label}.rid`),
    uid: assertNullableString(journey.uid, `${label}.uid`),
    trainId: assertNullableString(journey.trainId, `${label}.trainId`),
    ssd: assertNullableString(journey.ssd, `${label}.ssd`),
    toc: assertNullableString(journey.toc, `${label}.toc`),
    isPassengerSvc,
    stopCount: stops.length,
    stops,
  };
}

export function deriveDarwinCandidateServices(parsedDarwin) {
  assertObject(parsedDarwin, "parsedDarwin");

  if (!Array.isArray(parsedDarwin.journeys)) {
    throw new Error("parsedDarwin.journeys must be an array");
  }

  return parsedDarwin.journeys
    .map((journey, index) => normalizeJourney(journey, index))
    .filter(Boolean);
}
