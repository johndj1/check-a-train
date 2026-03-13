import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { persistHistoricalRecords } from '../lib/historical/persistence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const defaultFixturePath = path.join(
  repoRoot,
  'data',
  'fixtures',
  'historical-services.sample.json',
);

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
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
  if (typeof value !== 'boolean') {
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
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = assertString(value, label).toUpperCase();

  if (!/^[A-Z]{2}$/.test(normalized)) {
    throw new Error(`${label} must be a 2-letter TOC code`);
  }

  return normalized;
}

function parseCanonicalRecord(input, index) {
  const label = `fixture record at index ${index}`;
  assertObject(input, label);

  return {
    serviceKey: assertString(input.serviceKey, `${label}.serviceKey`),
    serviceDate: assertIsoDate(input.serviceDate, `${label}.serviceDate`),
    trainUid: assertNullableString(input.trainUid, `${label}.trainUid`),
    rid: assertNullableString(input.rid, `${label}.rid`),
    tocCode: normalizeTocCode(input.tocCode, `${label}.tocCode`),
    originCrs: normalizeCrs(input.originCrs, `${label}.originCrs`),
    destinationCrs: normalizeCrs(
      input.destinationCrs,
      `${label}.destinationCrs`,
    ),
    scheduledDepartureOrigin: assertNullableIsoTimestamp(
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

async function loadFixtureRecords(fixturePath) {
  const raw = await readFile(fixturePath, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Fixture file must contain a non-empty array');
  }

  return parsed.map((item, index) => parseCanonicalRecord(item, index));
}

async function main() {
  const baseUrl = requireEnv('SUPABASE_URL');
  const apiKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const fixturePath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : defaultFixturePath;

  const records = await loadFixtureRecords(fixturePath);
  const result = await persistHistoricalRecords(records, { baseUrl, apiKey });

  console.log(
    JSON.stringify(
      {
        fixturePath,
        ...result,
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
