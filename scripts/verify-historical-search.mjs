import { searchHistoricalServices } from "../lib/historical/search.mjs";

const DEFAULT_WINDOW_MINUTES = 30;
const DEFAULT_LIMIT = 5;

const DEFAULT_QUERY_SUITE = [
  {
    label: "CHX -> ORP around 00:50 on 2026-03-15",
    originCrs: "CHX",
    destinationCrs: "ORP",
    serviceDate: "2026-03-15",
    approxDepartureTime: "00:50",
  },
  {
    label: "BMN -> GRP around 05:20 on 2026-03-13",
    originCrs: "BMN",
    destinationCrs: "GRP",
    serviceDate: "2026-03-13",
    approxDepartureTime: "05:20",
  },
  {
    label: "VIC -> DVP around 06:54 on 2026-03-14",
    originCrs: "VIC",
    destinationCrs: "DVP",
    serviceDate: "2026-03-14",
    approxDepartureTime: "06:54",
  },
  {
    label: "TON -> SEV around 15:45 on 2026-03-12",
    originCrs: "TON",
    destinationCrs: "SEV",
    serviceDate: "2026-03-12",
    approxDepartureTime: "15:45",
  },
];

function readArg(index) {
  return process.argv[index] ? String(process.argv[index]).trim() : "";
}

function formatQueryLine(query) {
  return [
    query.originCrs,
    "->",
    query.destinationCrs,
    "on",
    query.serviceDate,
    "around",
    query.approxDepartureTime,
  ].join(" ");
}

function formatCandidate(candidate, index) {
  return [
    `  ${index + 1}. serviceId=${candidate.serviceId}`,
    `     originCrs=${candidate.originCrs}`,
    ` destinationCrs=${candidate.destinationCrs}`,
    ` scheduledDepartureTs=${candidate.scheduledDepartureTs}`,
    ` scheduledArrivalTs=${candidate.scheduledArrivalTs}`,
    ` tocCode=${candidate.tocCode}`,
    ` status=${candidate.status}`,
    ` delayMinutes=${candidate.delayMinutes}`,
    ` departureDeltaMinutes=${candidate.departureDeltaMinutes}`,
  ].join("\n");
}

function formatResult(result, label) {
  const lines = [
    `Query: ${label}`,
    `Input: ${formatQueryLine(result.query)}`,
    `Window: +/-${result.query.windowMinutes} minutes (${result.query.searchWindowStartTs} -> ${result.query.searchWindowEndTs})`,
    `Candidate count: ${result.candidates.length}`,
  ];

  if (result.candidates.length === 0) {
    lines.push("Top candidates: none");
    return lines.join("\n");
  }

  lines.push("Top candidates:");
  for (const [index, candidate] of result.candidates.entries()) {
    lines.push(formatCandidate(candidate, index));
  }

  return lines.join("\n");
}

function buildSingleQueryFromArgs() {
  const originCrs = readArg(2);
  const destinationCrs = readArg(3);
  const serviceDate = readArg(4);
  const approxDepartureTime = readArg(5);

  if (!originCrs && !destinationCrs && !serviceDate && !approxDepartureTime) {
    return null;
  }

  return {
    label: `${originCrs} -> ${destinationCrs} on ${serviceDate} around ${approxDepartureTime}`,
    originCrs,
    destinationCrs,
    serviceDate,
    approxDepartureTime,
  };
}

async function main() {
  const singleQuery = buildSingleQueryFromArgs();
  const queries = singleQuery ? [singleQuery] : DEFAULT_QUERY_SUITE;

  for (const [index, query] of queries.entries()) {
    const result = await searchHistoricalServices(
      {
        originCrs: query.originCrs,
        destinationCrs: query.destinationCrs,
        serviceDate: query.serviceDate,
        approxDepartureTime: query.approxDepartureTime,
      },
      {
        windowMinutes: DEFAULT_WINDOW_MINUTES,
        limit: DEFAULT_LIMIT,
      },
    );

    if (index > 0) {
      console.log("");
    }

    console.log(formatResult(result, query.label));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
