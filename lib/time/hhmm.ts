export function hhmmToMins(hhmm: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return hh * 60 + mm;
}

export function minsToHHMM(totalMins: number) {
  if (!Number.isFinite(totalMins)) return null;
  let normalized = Math.floor(totalMins);
  normalized = ((normalized % 1440) + 1440) % 1440;
  const hh = Math.floor(normalized / 60);
  const mm = normalized % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function addMinutes(hhmm: string, minsToAdd: number) {
  const base = hhmmToMins(hhmm);
  if (base == null || !Number.isFinite(minsToAdd)) return null;
  return minsToHHMM(base + minsToAdd);
}
