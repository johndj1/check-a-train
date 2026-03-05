import { hhmmToMins } from "@/lib/time/hhmm";

export function isWithinWindow(targetHHMM: string, centerHHMM: string, windowMins: number) {
  const target = hhmmToMins(targetHHMM);
  const center = hhmmToMins(centerHHMM);
  if (target == null || center == null || !Number.isFinite(windowMins) || windowMins < 0) {
    return false;
  }
  let delta = target - center;
  if (delta < -720) delta += 1440;
  if (delta > 720) delta -= 1440;
  return Math.abs(delta) <= windowMins;
}

export function absDeltaMins(targetHHMM: string, centerHHMM: string) {
  const target = hhmmToMins(targetHHMM);
  const center = hhmmToMins(centerHHMM);
  if (target == null || center == null) return Number.POSITIVE_INFINITY;
  let delta = target - center;
  if (delta < -720) delta += 1440;
  if (delta > 720) delta -= 1440;
  return Math.abs(delta);
}
