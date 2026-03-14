import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  buildHistoricalSearchRow,
  persistHistoricalRecords,
} from "../lib/historical/persistence.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const defaultInputPath = path.join(
  repoRoot,
  "data",
  "derived",
  "darwin-timetable.southeastern-canonical.json",
);
const persistenceBatchSize = 200;

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

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

function assertIsoTimestamp(value, label) {
  const normalized = assertString(value, label);

  if (Number.isNaN(Date.parse(normalized))) {
    throw new Error(`${label} must be a valid ISO timestamp`);
  }

  return normalized;
}

function assertNullableIsoTimestamp(value, label) {
  if (value === null || value === undefined) {
    return null;
  }

  return assertIsoTimestamp(value, label);
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

function parseCanonicalService(input, index) {
  const label = `services[${index}]`;
  assertObject(input, label);

  return {
    serviceKey: assertString(input.serviceKey, `${label}.serviceKey`),
    serviceDate: assertIsoDate(input.serviceDate, `${label}.serviceDate`),
    trainUid: assertNullableString(input.trainUid, `${label}.trainUid`),
    rid: assertNullableString(input.rid, `${label}.rid`),
    tocCode: normalizeTocCode(input.tocCode, `${label}.tocCode`),
    originCrs: normalizeCrs(input.originCrs, `${label}.originCrs`),
    destinationCrs: normalizeCrs(input.destinationCrs, `${label}.destinationCrs`),
    scheduledDepartureOrigin: assertIsoTimestamp(
      input.scheduledDepartureOrigin,
      `${label}.scheduledDepartureOrigin`,
    ),
    scheduledArrivalDestination: assertNullableIsoTimestamp(
      input.scheduledArrivalDestination,
      `${label}.scheduledArrivalDestination`,
    ),
    actualDepartureOrigin: assertNullableIsoTimestamp(
      input.actualDepartureOrigin,
      `${label}.actualDepartureOrigin`,
    ),
    actualArrivalDestination: assertNullableIsoTimestamp(
      input.actualArrivalDestination,
      `${label}.actualArrivalDestination`,
    ),
    status: assertString(input.status, `${label}.status`),
    isCancelled: assertBoolean(input.isCancelled, `${label}.isCancelled`),
    isPartCancelled: assertBoolean(
      input.isPartCancelled,
      `${label}.isPartCancelled`,
    ),
    delayMinutes: assertNullableNonNegativeInteger(
      input.delayMinutes,
      `${label}.delayMinutes`,
    ),
    dataQualityScore: assertNullableNonNegativeInteger(
      input.dataQualityScore,
      `${label}.dataQualityScore`,
    ),
  };
}

function parseSearchRow(input, index) {
  const label = `searchRows[${index}]`;
  assertObject(input, label);

  return {
    serviceDate: assertIsoDate(input.serviceDate, `${label}.serviceDate`),
    originCrs: normalizeCrs(input.originCrs, `${label}.originCrs`),
    destinationCrs: normalizeCrs(input.destinationCrs, `${label}.destinationCrs`),
    scheduledDepartureTs: assertIsoTimestamp(
      input.scheduledDepartureTs,
      `${label}.scheduledDepartureTs`,
    ),
    scheduledArrivalTs: assertIsoTimestamp(
      input.scheduledArrivalTs,
      `${label}.scheduledArrivalTs`,
    ),
    tocCode: normalizeTocCode(input.tocCode, `${label}.tocCode`),
    status: assertString(input.status, `${label}.status`),
    isCancelled: assertBoolean(input.isCancelled, `${label}.isCancelled`),
    delayMinutes: assertNullableNonNegativeInteger(
      input.delayMinutes,
      `${label}.delayMinutes`,
    ),
  };
}

function validateAlignedRows(services, searchRows) {
  if (services.length !== searchRows.length) {
    throw new Error(
      `services and searchRows must have the same number of entries: ${services.length} services, ${searchRows.length} search rows`,
    );
  }

  for (let index = 0; index < services.length; index += 1) {
    const service = services[index];
    const searchRow = searchRows[index];

    if (service.serviceDate !== searchRow.serviceDate) {
      throw new Error(
        `services[${index}] and searchRows[${index}] have different serviceDate values`,
      );
    }

    if (service.originCrs !== searchRow.originCrs) {
      throw new Error(
        `services[${index}] and searchRows[${index}] have different originCrs values`,
      );
    }

    if (service.destinationCrs !== searchRow.destinationCrs) {
      throw new Error(
        `services[${index}] and searchRows[${index}] have different destinationCrs values`,
      );
    }

    if (
      service.scheduledDepartureOrigin !== searchRow.scheduledDepartureTs
    ) {
      throw new Error(
        `services[${index}] and searchRows[${index}] have different scheduled departure timestamps`,
      );
    }

    if (
      service.scheduledArrivalDestination !== searchRow.scheduledArrivalTs
    ) {
      throw new Error(
        `services[${index}] and searchRows[${index}] have different scheduled arrival timestamps`,
      );
    }

    if (service.tocCode !== searchRow.tocCode) {
      throw new Error(
        `services[${index}] and searchRows[${index}] have different tocCode values`,
      );
    }

    if (service.status !== searchRow.status) {
      throw new Error(
        `services[${index}] and searchRows[${index}] have different status values`,
      );
    }

    if (service.isCancelled !== searchRow.isCancelled) {
      throw new Error(
        `services[${index}] and searchRows[${index}] have different isCancelled values`,
      );
    }

    if (service.delayMinutes !== searchRow.delayMinutes) {
      throw new Error(
        `services[${index}] and searchRows[${index}] have different delayMinutes values`,
      );
    }
  }
}

function validateDerivedSearchRows(services, searchRows) {
  for (let index = 0; index < services.length; index += 1) {
    const service = services[index];
    const expectedRow = searchRows[index];
    const generatedRow = buildHistoricalSearchRow(service, "__validation__");

    if (generatedRow.service_date !== expectedRow.serviceDate) {
      throw new Error(
        `Generated search row for services[${index}] has unexpected serviceDate value`,
      );
    }

    if (generatedRow.origin_crs !== expectedRow.originCrs) {
      throw new Error(
        `Generated search row for services[${index}] has unexpected originCrs value`,
      );
    }

    if (generatedRow.destination_crs !== expectedRow.destinationCrs) {
      throw new Error(
        `Generated search row for services[${index}] has unexpected destinationCrs value`,
      );
    }

    if (
      generatedRow.scheduled_departure_ts !== expectedRow.scheduledDepartureTs
    ) {
      throw new Error(
        `Generated search row for services[${index}] has unexpected scheduledDepartureTs value`,
      );
    }

    if (generatedRow.scheduled_arrival_ts !== expectedRow.scheduledArrivalTs) {
      throw new Error(
        `Generated search row for services[${index}] has unexpected scheduledArrivalTs value`,
      );
    }

    if (generatedRow.toc_code !== expectedRow.tocCode) {
      throw new Error(
        `Generated search row for services[${index}] has unexpected tocCode value`,
      );
    }

    if (generatedRow.status !== expectedRow.status) {
      throw new Error(
        `Generated search row for services[${index}] has unexpected status value`,
      );
    }

    if (generatedRow.is_cancelled !== expectedRow.isCancelled) {
      throw new Error(
        `Generated search row for services[${index}] has unexpected isCancelled value`,
      );
    }

    if (generatedRow.delay_minutes !== expectedRow.delayMinutes) {
      throw new Error(
        `Generated search row for services[${index}] has unexpected delayMinutes value`,
      );
    }
  }
}

async function readJsonFile(inputPath) {
  let raw;

  try {
    raw = await readFile(inputPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      throw new Error(`Unable to read canonical inspection JSON file: ${inputPath}`);
    }

    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Canonical inspection JSON file is not valid JSON: ${inputPath}`);
  }
}

async function loadCanonicalSubset(inputPath) {
  const parsed = await readJsonFile(inputPath);
  assertObject(parsed, "canonical inspection JSON root");
  assertNonEmptyArray(parsed.services, "canonical inspection JSON services");
  assertNonEmptyArray(parsed.searchRows, "canonical inspection JSON searchRows");

  const services = parsed.services.map((item, index) =>
    parseCanonicalService(item, index),
  );
  const searchRows = parsed.searchRows.map((item, index) =>
    parseSearchRow(item, index),
  );

  validateAlignedRows(services, searchRows);
  validateDerivedSearchRows(services, searchRows);

  return {
    services,
    searchRows,
  };
}

async function persistCanonicalServicesInBatches(services, options) {
  let servicesPersisted = 0;
  let searchRowsPersisted = 0;

  for (
    let startIndex = 0;
    startIndex < services.length;
    startIndex += persistenceBatchSize
  ) {
    const batch = services.slice(startIndex, startIndex + persistenceBatchSize);
    const result = await persistHistoricalRecords(batch, options);
    servicesPersisted += result.serviceCount;
    searchRowsPersisted += result.searchRowCount;
  }

  return {
    servicesPersisted,
    searchRowsPersisted,
  };
}

async function main() {
  const sourceFile = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : defaultInputPath;

  const { services, searchRows } = await loadCanonicalSubset(sourceFile);
  const baseUrl = requireEnv("SUPABASE_URL");
  const apiKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const result = await persistCanonicalServicesInBatches(services, {
    baseUrl,
    apiKey,
  });

  console.log(
    JSON.stringify(
      {
        sourceFile,
        servicesRead: services.length,
        searchRowsRead: searchRows.length,
        servicesPersisted: result.servicesPersisted,
        searchRowsPersisted: result.searchRowsPersisted,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
