import stations from "@/data/stations.json";

export type Station = {
  name: string;
  code: string;
};

export async function getStationsIndex(): Promise<Station[]> {
  // Today: local JSON
  // Later: Redis → Blob fallback
  return stations as Station[];
}

export function findStationByName(name: string) {
  const n = name.trim().toLowerCase();
  return stations.find(
    s => s.name.toLowerCase() === n
  );
}

export function isValidStationName(name: string) {
  return !!findStationByName(name);
}