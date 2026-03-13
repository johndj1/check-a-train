import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { mapTimetableRecordsToCanonicalHistorical } from "../lib/historical/timetable-mapper.mjs";
import { persistHistoricalRecords } from "../lib/historical/persistence.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const defaultSamplePath = path.join(
  repoRoot,
  "data",
  "samples",
  "historical-timetable.sample.json",
);

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function loadTimetableSample(samplePath) {
  const raw = await readFile(samplePath, "utf8");
  const parsed = JSON.parse(raw);

  return mapTimetableRecordsToCanonicalHistorical(parsed);
}

async function main() {
  const baseUrl = requireEnv("SUPABASE_URL");
  const apiKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const samplePath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : defaultSamplePath;

  const records = await loadTimetableSample(samplePath);
  const result = await persistHistoricalRecords(records, { baseUrl, apiKey });

  console.log(
    JSON.stringify(
      {
        samplePath,
        sourceShape: "historical-timetable-sample",
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
