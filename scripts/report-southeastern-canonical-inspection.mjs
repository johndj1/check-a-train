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
  "darwin-timetable.southeastern-canonical.json",
);
const outputPath = path.join(
  derivedDirectory,
  "darwin-timetable.southeastern-canonical.report.json",
);
const TOP_LIST_LIMIT = 20;

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

function normalizeString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function normalizeUppercaseCode(value) {
  const normalized = normalizeString(value);
  return normalized ? normalized.toUpperCase() : null;
}

function validateInspection(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Canonical inspection JSON file must contain an object");
  }

  if (!Array.isArray(parsed.services)) {
    throw new Error("Canonical inspection JSON file must contain a services array");
  }

  if (!Array.isArray(parsed.exclusions)) {
    throw new Error("Canonical inspection JSON file must contain an exclusions array");
  }

  if (typeof parsed.servicesConsidered !== "number") {
    throw new Error("Canonical inspection JSON file must contain numeric servicesConsidered");
  }

  if (typeof parsed.eligibleServiceCount !== "number") {
    throw new Error(
      "Canonical inspection JSON file must contain numeric eligibleServiceCount",
    );
  }

  if (typeof parsed.excludedServiceCount !== "number") {
    throw new Error(
      "Canonical inspection JSON file must contain numeric excludedServiceCount",
    );
  }

  return parsed;
}

function incrementCount(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortEntries(entries) {
  return entries.sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.sortKey.localeCompare(right.sortKey);
  });
}

function mapToReasonCounts(map) {
  return sortEntries(
    Array.from(map.entries(), ([reason, count]) => ({
      reason,
      count,
      sortKey: reason,
    })),
  ).map(({ reason, count }) => ({ reason, count }));
}

function mapToTiplocCounts(map) {
  return sortEntries(
    Array.from(map.entries(), ([tiploc, count]) => ({
      tiploc,
      count,
      sortKey: tiploc,
    })),
  )
    .slice(0, TOP_LIST_LIMIT)
    .map(({ tiploc, count }) => ({ tiploc, count }));
}

function mapToTocCounts(map) {
  return sortEntries(
    Array.from(map.entries(), ([tocCode, count]) => ({
      tocCode,
      count,
      sortKey: tocCode,
    })),
  ).map(({ tocCode, count }) => ({ tocCode, count }));
}

function mapToOriginDestinationCounts(map) {
  return sortEntries(
    Array.from(map.entries(), ([pair, count]) => {
      const [originCrs, destinationCrs] = pair.split(":");

      return {
        pair,
        originCrs,
        destinationCrs,
        count,
        sortKey: pair,
      };
    }),
  ).map(({ pair, originCrs, destinationCrs, count }) => ({
    pair,
    originCrs,
    destinationCrs,
    count,
  }));
}

function buildReport(inspection, sourceFile) {
  const exclusionCountsByReason = new Map();
  const unresolvedOriginTiplocs = new Map();
  const unresolvedDestinationTiplocs = new Map();
  const eligibleServicesByToc = new Map();
  const eligibleOriginDestinationPairs = new Map();

  for (const exclusion of inspection.exclusions) {
    const reason = normalizeString(exclusion?.reason) ?? "unknown";
    incrementCount(exclusionCountsByReason, reason);

    if (reason === "missing_resolved_origin") {
      const originTiploc = normalizeUppercaseCode(exclusion?.originTiploc) ?? "UNKNOWN";
      incrementCount(unresolvedOriginTiplocs, originTiploc);
    }

    if (reason === "missing_resolved_destination") {
      const destinationTiploc =
        normalizeUppercaseCode(exclusion?.destinationTiploc) ?? "UNKNOWN";
      incrementCount(unresolvedDestinationTiplocs, destinationTiploc);
    }
  }

  for (const service of inspection.services) {
    const tocCode = normalizeUppercaseCode(service?.tocCode) ?? "UNKNOWN";
    const originCrs = normalizeUppercaseCode(service?.originCrs) ?? "UNKNOWN";
    const destinationCrs = normalizeUppercaseCode(service?.destinationCrs) ?? "UNKNOWN";

    incrementCount(eligibleServicesByToc, tocCode);
    incrementCount(eligibleOriginDestinationPairs, `${originCrs}:${destinationCrs}`);
  }

  return {
    sourceFile,
    servicesConsidered: inspection.servicesConsidered,
    eligibleServiceCount: inspection.eligibleServiceCount,
    excludedServiceCount: inspection.excludedServiceCount,
    exclusionCountsByReason: mapToReasonCounts(exclusionCountsByReason),
    topUnresolvedOriginTiplocs: mapToTiplocCounts(unresolvedOriginTiplocs),
    topUnresolvedDestinationTiplocs: mapToTiplocCounts(unresolvedDestinationTiplocs),
    eligibleServicesByToc: mapToTocCounts(eligibleServicesByToc),
    eligibleOriginDestinationPairs: mapToOriginDestinationCounts(
      eligibleOriginDestinationPairs,
    ),
  };
}

async function main() {
  const inputPath = resolveInputPath(process.argv[2]);
  const inspection = validateInspection(
    await readJsonFile(inputPath, "Southeastern canonical inspection JSON file"),
  );
  const report = buildReport(inspection, inputPath);

  await mkdir(derivedDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        sourceFile: inputPath,
        servicesConsidered: report.servicesConsidered,
        eligibleServiceCount: report.eligibleServiceCount,
        excludedServiceCount: report.excludedServiceCount,
        topExclusionReasons: report.exclusionCountsByReason.slice(0, 5),
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
