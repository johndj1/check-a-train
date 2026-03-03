import { NextResponse } from "next/server";
import { getStationsIndex, type Station } from "@/lib/stations";

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function score(q: string, s: Station) {
  const name = s.name.toLowerCase();
  const code = s.code.toLowerCase();

  if (code === q) return 100;
  if (name === q) return 90;
  if (code.startsWith(q)) return 80;
  if (name.startsWith(q)) return 70;
  if (name.includes(q)) return 50;
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

  const stations = await getStationsIndex();

  const results = stations
    .map((s) => ({ s, score: score(q, s) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((x) => x.s);

  return NextResponse.json({ query: q, results });
}