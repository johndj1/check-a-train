import { readFile, writeFile } from "node:fs/promises";

const LOCAL_SOURCE_PATH = "data/stations.json";
const OUTPUT_PATH = "data/stations.uk.json";

function normalizeName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}

function toAliasList(name) {
  const aliases = new Set();
  const normalized = normalizeName(name);
  if (!normalized) return [];
  if (normalized.startsWith("London ")) {
    aliases.add(normalized.replace(/^London\s+/, ""));
  }
  return [...aliases];
}

function sanitizeStationRows(rows) {
  const byCrs = new Map();
  for (const row of rows) {
    const crs = String(row?.crs ?? "")
      .trim()
      .toUpperCase();
    const name = normalizeName(row?.name);
    if (!/^[A-Z]{3}$/.test(crs) || name.length === 0) continue;
    if (byCrs.has(crs)) continue;
    const aliases = toAliasList(name);
    byCrs.set(crs, aliases.length > 0 ? { crs, name, aliases } : { crs, name });
  }
  return [...byCrs.values()].sort((a, b) => a.name.localeCompare(b.name) || a.crs.localeCompare(b.crs));
}

async function loadLocalSource() {
  const raw = await readFile(LOCAL_SOURCE_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${LOCAL_SOURCE_PATH} is not an array`);
  return parsed;
}

async function main() {
  let sourceRows;
  try {
    sourceRows = await loadLocalSource();
    console.log(`Loaded ${sourceRows.length} rows from local source ${LOCAL_SOURCE_PATH}.`);
  } catch (err) {
    throw new Error(
      [
        "Offline refresh requires a local source dataset.",
        `Expected: ${LOCAL_SOURCE_PATH}`,
        "No HTTP source is configured in this script.",
        `Original error: ${err instanceof Error ? err.message : String(err)}`,
      ].join(" ")
    );
  }

  const stations = sanitizeStationRows(sourceRows);
  if (stations.length === 0) {
    throw new Error("No valid station rows after sanitization.");
  }

  await writeFile(OUTPUT_PATH, `${JSON.stringify(stations, null, 2)}\n`, "utf8");
  console.log(`Wrote ${stations.length} stations to ${OUTPUT_PATH}.`);
  console.log(
    "Refresh policy: run this manually once per month after updating data/stations.json from an approved source."
  );
}

await main();
