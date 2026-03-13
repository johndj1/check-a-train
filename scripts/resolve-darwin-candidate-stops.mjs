import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveDarwinCandidateServices } from "../lib/darwin/tiploc-resolution.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const derivedDirectory = path.join(repoRoot, "data", "derived");
const referenceDirectory = path.join(repoRoot, "data", "reference");
const defaultInputPath = path.join(
  derivedDirectory,
  "darwin-timetable.candidate-services.json",
);
const mappingPath = path.join(
  referenceDirectory,
  "tiploc-mapping.sample.json",
);
const outputPath = path.join(
  derivedDirectory,
  "darwin-timetable.resolved-stops.json",
);

function resolveInputPath(argvValue) {
  return argvValue
    ? path.resolve(process.cwd(), argvValue)
    : defaultInputPath;
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

async function main() {
  const inputPath = resolveInputPath(process.argv[2]);
  const candidateServices = await readJsonFile(
    inputPath,
    "Darwin candidate-service JSON file",
  );
  const mappingSource = await readJsonFile(
    mappingPath,
    "TIPLOC mapping JSON file",
  );
  const { services, summary } = resolveDarwinCandidateServices(
    candidateServices,
    mappingSource,
  );

  await mkdir(derivedDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(services, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        sourceFile: inputPath,
        candidateServicesRead: services.length,
        stopsResolved: summary.stopsResolved,
        stopsUnresolved: summary.stopsUnresolved,
        stopsAmbiguous: summary.stopsAmbiguous,
        stopsExcluded: summary.stopsExcluded,
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
