import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { mapDarwinCorridorSubsetToCanonicalInspection } from "../lib/historical/darwin-corridor-canonical-mapper.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const derivedDirectory = path.join(repoRoot, "data", "derived");
const defaultInputPath = path.join(
  derivedDirectory,
  "darwin-timetable.southeastern-corridor.json",
);
const outputPath = path.join(
  derivedDirectory,
  "darwin-timetable.southeastern-canonical.json",
);

function resolveInputPath(argvValue) {
  return argvValue ? path.resolve(process.cwd(), argvValue) : defaultInputPath;
}

async function readJsonFile(inputPath, label) {
  let raw;

  try {
    raw = await readFile(inputPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      throw new Error(`Unable to read ${label}: ${inputPath}`);
    }

    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON: ${inputPath}`);
  }
}

function validateCorridorInput(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Corridor JSON file must contain an object");
  }

  if (!Array.isArray(parsed.services)) {
    throw new Error("Corridor JSON file must contain a services array");
  }

  return parsed;
}

async function main() {
  const inputPath = resolveInputPath(process.argv[2]);
  const parsed = validateCorridorInput(
    await readJsonFile(inputPath, "Darwin corridor JSON file"),
  );
  const inspection = mapDarwinCorridorSubsetToCanonicalInspection({
    ...parsed,
    sourceFile: inputPath,
  });

  await mkdir(derivedDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(inspection, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        sourceFile: inputPath,
        servicesConsidered: inspection.servicesConsidered,
        eligibleServicesMapped: inspection.eligibleServiceCount,
        excludedServices: inspection.excludedServiceCount,
        searchRowsDerived: inspection.searchRows.length,
        outputFile: outputPath,
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
