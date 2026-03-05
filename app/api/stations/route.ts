import { NextResponse } from "next/server";
import stationsUkData from "@/data/stations.uk.json";

type Station = {
  crs: string;
  name: string;
  code: string;
};

type StationSearchEntry = {
  crs: string;
  name: string;
  aliases?: string[];
};

const stationsUk = stationsUkData as StationSearchEntry[];
const MAX_RESULTS = 15;

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function score(q: string, s: StationSearchEntry) {
  const name = s.name.toLowerCase();
  const code = s.crs.toLowerCase();
  const aliases = (s.aliases ?? []).map((a) => a.toLowerCase());
  const aliasPrefix = aliases.some((a) => a.startsWith(q));
  const aliasContains = aliases.some((a) => a.includes(q));
  const aliasExact = aliases.some((a) => a === q);

  if (code === q) return 100;
  if (name === q || aliasExact) return 95;
  if (code.startsWith(q)) return 90;
  if (name.startsWith(q)) return 80;
  if (aliasPrefix) return 75;
  if (name.includes(q)) return 60;
  if (aliasContains) return 55;
  if (code.includes(q)) return 50;
  return 0;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("q") ?? "";
  const q = normalize(raw);

  // Guardrails
  if (q.length < 2) {
    return NextResponse.json({ query: q, results: [] });
  }

  const results = stationsUk
    .map((s) => ({ s, score: score(q, s) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.s.name.localeCompare(b.s.name);
    })
    .slice(0, MAX_RESULTS)
    .map(
      (x): Station => ({
        crs: x.s.crs,
        name: x.s.name,
        code: x.s.crs,
      })
    );

  return NextResponse.json({ query: q, results });
}
