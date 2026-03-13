import { gunzip } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { parseDarwinTimetableXml } from "../lib/darwin/timetable-parser.mjs";

const gunzipAsync = promisify(gunzip);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outputDirectory = path.join(repoRoot, "data", "derived");
const outputPath = path.join(outputDirectory, "darwin-timetable.parsed.json");

async function readGzippedXmlFile(inputPath) {
  let compressed;

  try {
    compressed = await readFile(inputPath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      throw new Error(`Unable to read Darwin timetable file: ${inputPath}`);
    }

    throw error;
  }

  try {
    const xmlBuffer = await gunzipAsync(compressed);
    return xmlBuffer.toString("utf8");
  } catch {
    throw new Error(
      `Unable to decompress Darwin timetable file as gzip: ${inputPath}`,
    );
  }
}

function resolveInputPath(argvValue) {
  if (!argvValue) {
    throw new Error(
      "Usage: node scripts/parse-darwin-timetable-sample.mjs <path-to-darwin-timetable.xml.gz>",
    );
  }

  return path.resolve(process.cwd(), argvValue);
}

async function main() {
  const inputPath = resolveInputPath(process.argv[2]);
  const xml = await readGzippedXmlFile(inputPath);
  const normalized = parseDarwinTimetableXml(xml, {
    sourceFileName: path.basename(inputPath),
  });

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        sourceFile: inputPath,
        totalJourneys: normalized.rawJourneyCount,
        passengerJourneysExtracted: normalized.passengerJourneyCount,
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
