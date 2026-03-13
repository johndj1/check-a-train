import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { deriveDarwinCandidateServices } from "../lib/darwin/candidate-services.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outputDirectory = path.join(repoRoot, "data", "derived");
const defaultInputPath = path.join(
  outputDirectory,
  "darwin-timetable.parsed.json",
);
const outputPath = path.join(
  outputDirectory,
  "darwin-timetable.candidate-services.json",
);

function resolveInputPath(argvValue) {
  return argvValue
    ? path.resolve(process.cwd(), argvValue)
    : defaultInputPath;
}

async function readParsedDarwinFile(inputPath) {
  let raw;

  try {
    raw = await readFile(inputPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      throw new Error(`Unable to read parsed Darwin JSON file: ${inputPath}`);
    }

    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Parsed Darwin JSON file is not valid JSON: ${inputPath}`);
  }
}

async function main() {
  const inputPath = resolveInputPath(process.argv[2]);
  const parsedDarwin = await readParsedDarwinFile(inputPath);
  const candidateServices = deriveDarwinCandidateServices(parsedDarwin);

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(candidateServices, null, 2)}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        sourceFile: inputPath,
        totalJourneysRead: Array.isArray(parsedDarwin.journeys)
          ? parsedDarwin.journeys.length
          : null,
        candidateServicesWritten: candidateServices.length,
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
