import { hhmmToMins } from "@/lib/time/hhmm";

function diffMins(aimed: string, expected: string) {
  const a = hhmmToMins(aimed);
  const e = hhmmToMins(expected);
  if (a == null || e == null) return null;
  let d = e - a;
  if (d < -720) d += 1440;
  if (d > 720) d -= 1440;
  return d;
}

export function deriveStatus(
  aimed: string | null,
  expected: string | null,
  cancelled: boolean
): "On time" | "Delayed" | "Cancelled" | "Unknown" {
  if (cancelled) return "Cancelled";
  if (aimed && expected) {
    const delay = diffMins(aimed, expected);
    if (delay === 0) return "On time";
    if (delay !== null && delay > 0) return "Delayed";
  }
  return "Unknown";
}
