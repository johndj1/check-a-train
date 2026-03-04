import { useEffect, useState } from "react";

export type Service = {
  uid: string;
  operator: string | null;
  operatorName: string;
  platform: string | null;

  originName: string;
  destinationName: string;

  aimedDeparture: string; // HH:MM
  expectedDeparture: string | null; // HH:MM or null
  delayMins: number | null;

  status: "On time" | "Delayed" | "Cancelled" | "Unknown";
  callsAtTo?: boolean;
};

type JourneyQuery = {
  submitted: boolean;
  formValid: boolean;
  from: string;
  to: string;
  date: string;
  time: string;
  windowMins: number;
};

type JourneyApiResponse = {
  query: { from: string; to: string; date: string; time: string; window: number };
  services: Service[];
  source: string;
  error?: string;
  upstream?: unknown;
};

function tryParseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function useJourneySearch(q: JourneyQuery) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function run() {
      if (!q.submitted || !q.formValid) {
        setServices([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const url =
        `/api/journeys?from=${encodeURIComponent(q.from)}` +
        `&to=${encodeURIComponent(q.to)}` +
        `&date=${encodeURIComponent(q.date)}` +
        `&time=${encodeURIComponent(q.time)}` +
        `&window=${encodeURIComponent(String(q.windowMins))}`;

      try {
        const res = await fetch(url, { signal: controller.signal });

        // ✅ Always read as text first (prevents JSON parse exploding on HTML)
        const raw = await res.text();

        const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
        const data = isJson ? (tryParseJson(raw) as JourneyApiResponse | null) : null;

        if (!res.ok) {
          // Prefer JSON error, else show first bit of HTML/text
          const msg =
            data?.error ??
            (raw.trim().startsWith("<") ? "Server returned HTML (check /api/journeys error)." : raw.slice(0, 200)) ??
            "Failed to fetch journeys.";
          setError(msg);
          setServices([]);
          return;
        }

        if (!data) {
          setError("API returned non-JSON response. Check /api/journeys in the browser.");
          setServices([]);
          return;
        }

        setServices(Array.isArray(data.services) ? data.services : []);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError("Network error while fetching journeys.");
          setServices([]);
        }
      } finally {
        setLoading(false);
      }
    }

    run();
    return () => controller.abort();
  }, [q.submitted, q.formValid, q.from, q.to, q.date, q.time, q.windowMins]);

  return { services, loading, error, setError };
}
