import { searchHistoricalServices } from "../lib/historical/search.mjs";

function readArg(index, fallback) {
  return process.argv[index] ? String(process.argv[index]).trim() : fallback;
}

async function main() {
  const result = await searchHistoricalServices(
    {
      originCrs: readArg(2, "TON"),
      destinationCrs: readArg(3, "SEV"),
      serviceDate: readArg(4, "2026-03-12"),
      approxDepartureTime: readArg(5, "15:45"),
    },
    {
      windowMinutes: 30,
      limit: 5,
    },
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
