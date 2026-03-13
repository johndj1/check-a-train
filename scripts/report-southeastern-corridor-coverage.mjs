import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const derivedDirectory = path.join(repoRoot, "data", "derived");
const defaultInputPath = path.join(
  derivedDirectory,
  "darwin-timetable.resolved-stops.json",
);
const outputPath = path.join(
  derivedDirectory,
  "darwin-timetable.southeastern-corridor.json",
);

const CORRIDOR_NAME = "southeastern-kent-commuter";

// Keep this rule set narrow and local to this inspection script.
const CORRIDOR_TIPLOCS = new Set([
  "TONBDG",
  "OTFORD",
  "ORPNGTN",
  "BROMLYS",
  "BROMLYN",
  "LEWISHM",
  "LNDNBDE",
  "CHRX",
  "VICTRIC",
  "DARTFD",
  "STROOD",
  "CHATHAM",
  "RAINHMK",
  "FAVRSHM",
]);

const CORRIDOR_RESOLVED_NAMES = new Set([
  "Tonbridge",
  "Otford",
  "Orpington",
  "Bromley South",
  "Bromley North",
  "Lewisham",
  "London Bridge",
  "London Charing Cross",
  "London Victoria",
  "Dartford",
  "Strood",
  "Chatham",
  "Rainham (Kent)",
  "Faversham",
]);

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

function matchesCorridor(stop) {
  const tiploc = typeof stop?.tiploc === "string" ? stop.tiploc.trim().toUpperCase() : null;
  const resolvedName =
    typeof stop?.resolvedName === "string" ? stop.resolvedName.trim() : null;

  return (
    (tiploc && CORRIDOR_TIPLOCS.has(tiploc)) ||
    (resolvedName && CORRIDOR_RESOLVED_NAMES.has(resolvedName))
  );
}

function summarizeMatchedStops(services) {
  const summary = {
    corridorStopsResolved: 0,
    corridorStopsUnresolved: 0,
    corridorStopsAmbiguous: 0,
  };

  for (const service of services) {
    for (const stop of service.corridorMatch.matchedStops) {
      switch (stop.resolutionStatus) {
        case "resolved":
          summary.corridorStopsResolved += 1;
          break;
        case "ambiguous":
          summary.corridorStopsAmbiguous += 1;
          break;
        default:
          summary.corridorStopsUnresolved += 1;
          break;
      }
    }
  }

  return summary;
}

function buildCorridorSubset(services, sourceFile) {
  const matchedServices = [];

  for (const service of services) {
    const stops = Array.isArray(service?.stops) ? service.stops : [];
    const matchedStops = stops.filter(matchesCorridor);

    if (matchedStops.length === 0) {
      continue;
    }

    matchedServices.push({
      ...service,
      corridorMatch: {
        matchedStopCount: matchedStops.length,
        matchedTiplocs: [...new Set(matchedStops.map((stop) => stop.tiploc).filter(Boolean))],
        matchedResolvedNames: [
          ...new Set(matchedStops.map((stop) => stop.resolvedName).filter(Boolean)),
        ],
        matchedStops,
      },
    });
  }

  const stopSummary = summarizeMatchedStops(matchedServices);

  return {
    sourceFile,
    corridor: CORRIDOR_NAME,
    corridorTiplocs: Array.from(CORRIDOR_TIPLOCS),
    serviceCount: matchedServices.length,
    summary: {
      servicesConsidered: services.length,
      corridorServicesMatched: matchedServices.length,
      ...stopSummary,
    },
    services: matchedServices,
  };
}

async function main() {
  const inputPath = resolveInputPath(process.argv[2]);
  const services = await readJsonFile(inputPath, "Darwin resolved-stop JSON file");

  if (!Array.isArray(services)) {
    throw new Error("Darwin resolved-stop JSON file must contain an array of services");
  }

  const corridorSubset = buildCorridorSubset(services, inputPath);

  await mkdir(derivedDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(corridorSubset, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        sourceFile: inputPath,
        servicesConsidered: corridorSubset.summary.servicesConsidered,
        corridorServicesMatched: corridorSubset.summary.corridorServicesMatched,
        corridorStopsResolved: corridorSubset.summary.corridorStopsResolved,
        corridorStopsUnresolved: corridorSubset.summary.corridorStopsUnresolved,
        corridorStopsAmbiguous: corridorSubset.summary.corridorStopsAmbiguous,
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
