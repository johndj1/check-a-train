const PASSENGER_STOP_KINDS = new Set(["OR", "IP", "DT"]);
const RESOLUTION_STATUSES = new Set([
  "resolved",
  "unresolved",
  "excluded_operational",
  "ambiguous",
]);

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

function normalizeResolutionEntry(entry, label) {
  assertObject(entry, label);

  const resolutionStatus = assertNullableString(
    entry.resolutionStatus,
    `${label}.resolutionStatus`,
  );

  if (!resolutionStatus || !RESOLUTION_STATUSES.has(resolutionStatus)) {
    throw new Error(
      `${label}.resolutionStatus must be one of: ${Array.from(
        RESOLUTION_STATUSES,
      ).join(", ")}`,
    );
  }

  const resolvedCrs = assertNullableString(
    entry.resolvedCrs,
    `${label}.resolvedCrs`,
  );
  const resolvedName = assertNullableString(
    entry.resolvedName,
    `${label}.resolvedName`,
  );

  if (
    resolutionStatus === "resolved" &&
    (!resolvedCrs || !resolvedName)
  ) {
    throw new Error(
      `${label} must include resolvedCrs and resolvedName when resolutionStatus is resolved`,
    );
  }

  return {
    resolutionStatus,
    resolvedCrs,
    resolvedName,
  };
}

function normalizeMappingEntries(mappingSource) {
  assertObject(mappingSource, "mappingSource");

  const entries =
    mappingSource.entries && typeof mappingSource.entries === "object"
      ? mappingSource.entries
      : mappingSource;

  assertObject(entries, "mappingSource.entries");

  return Object.fromEntries(
    Object.entries(entries)
      .filter(([key]) => !key.startsWith("_"))
      .map(([tiploc, entry]) => {
        const normalizedTiploc = tiploc.trim().toUpperCase();

        if (!normalizedTiploc) {
          throw new Error("mappingSource contains an empty TIPLOC key");
        }

        return [
          normalizedTiploc,
          normalizeResolutionEntry(
            entry,
            `mappingSource.entries.${normalizedTiploc}`,
          ),
        ];
      }),
  );
}

function normalizeStop(stop, serviceIndex, stopIndex) {
  const label = `candidateServices[${serviceIndex}].stops[${stopIndex}]`;
  assertObject(stop, label);

  return {
    kind: assertNullableString(stop.kind, `${label}.kind`),
    tiploc: assertNullableString(stop.tiploc, `${label}.tiploc`),
    scheduledArrival: assertNullableString(
      stop.scheduledArrival,
      `${label}.scheduledArrival`,
    ),
    scheduledDeparture: assertNullableString(
      stop.scheduledDeparture,
      `${label}.scheduledDeparture`,
    ),
  };
}

function resolveStop(stop, mappings) {
  const normalizedTiploc = stop.tiploc ? stop.tiploc.toUpperCase() : null;

  if (!stop.kind || !PASSENGER_STOP_KINDS.has(stop.kind)) {
    return {
      ...stop,
      resolutionStatus: "excluded_operational",
      resolvedCrs: null,
      resolvedName: null,
    };
  }

  if (!normalizedTiploc) {
    return {
      ...stop,
      resolutionStatus: "unresolved",
      resolvedCrs: null,
      resolvedName: null,
    };
  }

  const mapped = mappings[normalizedTiploc];

  if (!mapped) {
    return {
      ...stop,
      tiploc: normalizedTiploc,
      resolutionStatus: "unresolved",
      resolvedCrs: null,
      resolvedName: null,
    };
  }

  return {
    ...stop,
    tiploc: normalizedTiploc,
    resolutionStatus: mapped.resolutionStatus,
    resolvedCrs: mapped.resolvedCrs,
    resolvedName: mapped.resolvedName,
  };
}

function summarizeStops(services) {
  const summary = {
    stopsResolved: 0,
    stopsUnresolved: 0,
    stopsAmbiguous: 0,
    stopsExcluded: 0,
  };

  for (const service of services) {
    for (const stop of service.stops) {
      switch (stop.resolutionStatus) {
        case "resolved":
          summary.stopsResolved += 1;
          break;
        case "ambiguous":
          summary.stopsAmbiguous += 1;
          break;
        case "excluded_operational":
          summary.stopsExcluded += 1;
          break;
        default:
          summary.stopsUnresolved += 1;
          break;
      }
    }
  }

  return summary;
}

export function resolveDarwinCandidateServices(candidateServices, mappingSource) {
  if (!Array.isArray(candidateServices)) {
    throw new Error("candidateServices must be an array");
  }

  const mappings = normalizeMappingEntries(mappingSource);

  const resolvedServices = candidateServices.map((service, serviceIndex) => {
    const label = `candidateServices[${serviceIndex}]`;
    assertObject(service, label);

    if (!Array.isArray(service.stops)) {
      throw new Error(`${label}.stops must be an array`);
    }

    const stops = service.stops.map((stop, stopIndex) =>
      resolveStop(normalizeStop(stop, serviceIndex, stopIndex), mappings),
    );

    return {
      ...service,
      stopCount: stops.length,
      stops,
    };
  });

  return {
    services: resolvedServices,
    summary: summarizeStops(resolvedServices),
  };
}
