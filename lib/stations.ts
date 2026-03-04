import stations from "@/data/stations.json";

type StationRow = {
  crs: string;
  name: string;
};

export interface Station {
  crs: string;
  name: string;
  code: string;
}

const stationRows = stations as StationRow[];

function toStation(s: StationRow): Station {
  return {
    crs: s.crs,
    name: s.name,
    code: s.crs,
  };
}

export async function getStations(): Promise<Station[]> {
  return stationRows.map(toStation);
}

export async function getStationsIndex(): Promise<Station[]> {
  return getStations();
}

export function findStationByName(name: string) {
  const n = name.trim().toLowerCase();
  return stationRows.find(
    s => s.name.toLowerCase() === n
  );
}

export function isValidStationName(name: string) {
  return !!findStationByName(name);
}
