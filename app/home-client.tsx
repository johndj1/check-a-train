"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getStations, type Station } from "@/lib/stations";
import ServiceCard from "@/components/ServiceCard";
import type { Service } from "@/hooks/useJourneySearch";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowHHMM() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normalizeHHMM(time: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return time;

  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return time;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return time;
  return `${pad(hh)}:${pad(mm)}`;
}

function shiftTimeHHMM(time: string, deltaMinutes: number) {
  const normalized = normalizeHHMM(time);
  const m = /^(\d{2}):(\d{2})$/.exec(normalized);
  if (!m) return normalized;

  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return normalized;

  let total = hh * 60 + mm + deltaMinutes;
  total = ((total % 1440) + 1440) % 1440;

  const newH = Math.floor(total / 60);
  const newM = total % 60;
  return `${pad(newH)}:${pad(newM)}`;
}

function filterTimeForService(service: Service) {
  const raw = (service.expectedDeparture ?? service.aimedDeparture ?? "").trim();
  return raw.length > 0 ? raw : null;
}

function hhmmToMinsStrict(hhmm: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return hh * 60 + mm;
}

function minsToHHMM(mins: number) {
  if (!Number.isFinite(mins)) return null;
  const bounded = ((Math.trunc(mins) % 1440) + 1440) % 1440;
  const hh = Math.floor(bounded / 60);
  const mm = bounded % 60;
  return `${pad(hh)}:${pad(mm)}`;
}

export default function HomeClient() {
  const sp = useSearchParams();

  // URL state (defaults)
  const fromUrl = sp.get("from") ?? "";
  const toUrl = sp.get("to") ?? "";
  const dateUrl = sp.get("date") ?? todayISO();
  const timeUrl = sp.get("time") ?? nowHHMM();
  const windowUrl = Number(sp.get("window") ?? "30");
  const submitted = sp.get("submitted") === "1";

  // Controlled inputs
  const [from, setFrom] = useState(fromUrl);
  const [to, setTo] = useState(toUrl);
  const [date, setDate] = useState(dateUrl);
  const [time, setTime] = useState(timeUrl);

  const [fromCode, setFromCode] = useState<string>(sp.get("fromCode") ?? "");
  const [toCode, setToCode] = useState<string>(sp.get("toCode") ?? "");
  const [stations, setStations] = useState<Station[]>([]);
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  const windowMins = Number.isFinite(windowUrl) ? Math.min(Math.max(windowUrl, 15), 180) : 30;
  const isDev = process.env.NODE_ENV === "development";
  const debugFromQuery = sp.get("debug") === "1";
  const debugAvailable = isDev || debugFromQuery;

  // Source-of-truth validation: must pick from dropdown
  const formValid = !!fromCode && !!toCode;
  const [debugMode, setDebugMode] = useState(debugFromQuery);

  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryableError, setRetryableError] = useState(false);
  const [submittedState, setSubmittedState] = useState(submitted);
  const [queryView, setQueryView] = useState({
    fromName: fromUrl,
    toName: toUrl,
    fromCode: sp.get("fromCode") ?? "",
    toCode: sp.get("toCode") ?? "",
    date: dateUrl,
    time: timeUrl,
    windowMins,
  });

  async function runJourneyFetch(args: {
    fromCode: string;
    toCode: string;
    date: string;
    time: string;
    windowMins: number;
  }) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setServices([]);
      setRetryableError(true);
      setError("You appear to be offline. Check your connection and try again.");
      return;
    }

    const url =
      `/api/journeys?from=${encodeURIComponent(args.fromCode)}` +
      `&to=${encodeURIComponent(args.toCode)}` +
      `&date=${encodeURIComponent(args.date)}` +
      `&time=${encodeURIComponent(args.time)}` +
      `&window=${encodeURIComponent(String(args.windowMins))}`;

    if (process.env.NODE_ENV === "development") {
      console.log("journey fetch before fetch()", { url, ...args });
    }

    setLoading(true);
    setError(null);
    setRetryableError(false);
    try {
      const res = await fetch(url);
      if (process.env.NODE_ENV === "development") {
        console.log("journey fetch resolved", { url, status: res.status, ok: res.ok });
      }
      const raw = await res.text();
      const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
      const data = isJson
        ? (JSON.parse(raw) as { services?: Service[]; source?: string; error?: string; retryable?: boolean })
        : null;
      if (!res.ok) {
        const msg =
          data?.error ??
          (raw.trim().startsWith("<")
            ? "Server returned HTML (check /api/journeys error)."
            : raw.slice(0, 200)) ??
          "Failed to fetch journeys.";
        setServices([]);
        setRetryableError(Boolean(data?.retryable) || res.status >= 500);
        setError(msg);
        return;
      }
      if (!data || !Array.isArray(data.services)) {
        setServices([]);
        setRetryableError(true);
        setError("API returned non-JSON response. Check /api/journeys in the browser.");
        return;
      }
      const providerSource = typeof data.source === "string" ? data.source : null;
      setServices(
        data.services.map((service) => ({
          ...service,
          providerSource,
        })),
      );
      setRetryableError(false);
    } catch (e) {
      const err = e as Error;
      if (process.env.NODE_ENV === "development") {
        console.log("journey fetch error", {
          url,
          name: err.name,
          message: err.message,
          stack: err.stack ?? null,
        });
      }
      setServices([]);
      setRetryableError(true);
      setError("Network error while fetching journeys.");
    } finally {
      setLoading(false);
    }
  }

  function retryLastSearch() {
    if (!submittedState) return;
    void runJourneyFetch({
      fromCode: queryView.fromCode,
      toCode: queryView.toCode,
      date: queryView.date,
      time: queryView.time,
      windowMins: queryView.windowMins,
    });
  }

  useEffect(() => {
    let active = true;
    getStations()
      .then((all) => {
        if (active) setStations(all);
      })
      .catch(() => {
        if (active) setStations([]);
      });
    return () => {
      active = false;
    };
  }, []);

  function stationMatches(input: string) {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    return stations
      .filter(
        (s) => s.name.toLowerCase().includes(q) || s.crs.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }

  const fromMatches = stationMatches(from);
  const toMatches = stationMatches(to);

  // Keep codes synced from URL (so refresh/share works)
  useEffect(() => {
    if (debugFromQuery) setDebugMode(true);
  }, [debugFromQuery]);

  const filterTimeRows = services
    .flatMap((service) => {
      const filterTime = filterTimeForService(service);
      return filterTime ? [{ uid: service.uid, filterTime }] : [];
    });
  const firstFiveFilterTimes = filterTimeRows.slice(0, 5);
  const parsedFilterMins = filterTimeRows.flatMap((row) => {
    const mins = hhmmToMinsStrict(row.filterTime);
    return mins === null ? [] : [mins];
  });
  const minFilterTime =
    parsedFilterMins.length > 0 ? minsToHHMM(Math.min(...parsedFilterMins)) : null;
  const maxFilterTime =
    parsedFilterMins.length > 0 ? minsToHHMM(Math.max(...parsedFilterMins)) : null;

  function updateTimeInUrl(deltaMinutes: number) {
    const currentTime = queryView.time || time;
    const nextTime = shiftTimeHHMM(currentTime, deltaMinutes);
    setTime(nextTime);
    if (!submittedState) return;
    setQueryView((prev) => ({ ...prev, time: nextTime }));
    const params = new URLSearchParams(window.location.search);
    params.set("time", nextTime);
    window.history.replaceState({}, "", `/?${params.toString()}`);
    if (process.env.NODE_ENV === "development") {
      console.log("time shift click", { currentTime, deltaMinutes, nextTime });
    }
    void runJourneyFetch({
      fromCode: queryView.fromCode,
      toCode: queryView.toCode,
      date: queryView.date,
      time: nextTime,
      windowMins: queryView.windowMins,
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRetryableError(false);

    const f = from.trim();
    const t = to.trim();

    if (!f || !t) {
      setError("Please enter both departure and arrival stations.");
      return;
    }

    if (!fromCode || !toCode) {
      setError("Please select both stations from the dropdown (not free-text).");
      return;
    }

    if (fromCode === toCode) {
      setError("Departure and arrival stations must be different.");
      return;
    }

    const nextQuery = {
      fromName: f,
      toName: t,
      fromCode,
      toCode,
      date,
      time,
      windowMins: 30,
    };
    setSubmittedState(true);
    setQueryView(nextQuery);
    const params = new URLSearchParams(window.location.search);
    params.set("from", f);
    params.set("fromCode", fromCode);
    params.set("to", t);
    params.set("toCode", toCode);
    params.set("date", date);
    params.set("time", time);
    params.set("window", "30");
    params.set("submitted", "1");
    window.history.replaceState({}, "", `/?${params.toString()}`);
    void runJourneyFetch({
      fromCode,
      toCode,
      date,
      time,
      windowMins: 30,
    });
  }

  function onReset() {
    setError(null);
    setRetryableError(false);
    setFrom("");
    setTo("");
    setFromCode("");
    setToCode("");
    setDate(todayISO());
    setTime(nowHHMM());
    setServices([]);
    setSubmittedState(false);
    window.history.replaceState({}, "", `/`);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight">Check-a-Train</h1>
          <p className="mt-2 text-zinc-400">Delay Repay helper (live data via /api/journeys).</p>
        </header>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 shadow-sm">
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm text-zinc-300">Departure station</label>
              <div className="relative">
                <input
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setFromCode("");
                    setFromOpen(true);
                  }}
                  onFocus={() => setFromOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setFromOpen(false), 120);
                  }}
                  placeholder="e.g. Sevenoaks"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-600"
                  autoComplete="off"
                />
                {fromOpen && from.trim().length > 0 && (
                  <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-lg">
                    {fromMatches.length === 0 && (
                      <div className="px-3 py-2 text-sm text-zinc-400">No matches</div>
                    )}
                    {fromMatches.map((s) => (
                      <button
                        key={`from-${s.crs}`}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setFrom(s.name);
                          setFromCode(s.crs);
                          setFromOpen(false);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-900"
                      >
                        {s.name} ({s.crs})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-zinc-300">Arrival station</label>
              <div className="relative">
                <input
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setToCode("");
                    setToOpen(true);
                  }}
                  onFocus={() => setToOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setToOpen(false), 120);
                  }}
                  placeholder="e.g. London Bridge"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-600"
                  autoComplete="off"
                />
                {toOpen && to.trim().length > 0 && (
                  <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-lg">
                    {toMatches.length === 0 && (
                      <div className="px-3 py-2 text-sm text-zinc-400">No matches</div>
                    )}
                    {toMatches.map((s) => (
                      <button
                        key={`to-${s.crs}`}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setTo(s.name);
                          setToCode(s.crs);
                          setToOpen(false);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-900"
                      >
                        {s.name} ({s.crs})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-zinc-300">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-600"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-zinc-300">Approx. departure time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-600"
              />
            </div>

            <div className="md:col-span-2 flex flex-col gap-3">
              {error && (
                <div className="rounded-xl border border-red-900/60 bg-red-950/40 px-3 py-3 text-sm text-red-200">
                  <p>{error}</p>
                  {retryableError && submittedState && (
                    <button
                      type="button"
                      onClick={retryLastSearch}
                      disabled={loading}
                      className="mt-3 rounded-xl border border-red-700 px-3 py-2 text-xs font-semibold text-red-100 hover:bg-red-900/30 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading ? "Retrying…" : "Retry search"}
                    </button>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={loading || !formValid}
                  className={[
                    "flex-1 rounded-xl px-4 py-2 text-sm font-semibold",
                    loading || !formValid
                      ? "cursor-not-allowed bg-zinc-300/30 text-zinc-400"
                      : "bg-white text-zinc-950 hover:bg-zinc-200",
                  ].join(" ")}
                >
                  {loading ? "Loading…" : "Find trains"}
                </button>

                <button
                  type="button"
                  onClick={onReset}
                  className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  Reset
                </button>
              </div>
            </div>
          </form>
        </div>

        {submittedState && (
          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {queryView.fromName || from.trim()} → {queryView.toName || to.trim()}
                </h2>
                <p className="text-sm text-zinc-400">
                  {queryView.date} · window ±{queryView.windowMins} minutes around {queryView.time}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => updateTimeInUrl(-60)}
                  className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  Earlier (-60 mins)
                </button>
                <button
                  onClick={() => updateTimeInUrl(60)}
                  className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  Later (+60 mins)
                </button>
                {debugAvailable && (
                  <button
                    type="button"
                    onClick={() => setDebugMode((v) => !v)}
                    className={[
                      "rounded-xl border px-3 py-2 text-sm",
                      debugMode
                        ? "border-emerald-700 bg-emerald-900/20 text-emerald-200 hover:bg-emerald-900/30"
                        : "border-zinc-700 text-zinc-200 hover:bg-zinc-800",
                    ].join(" ")}
                  >
                    Debug {debugMode ? "on" : "off"}
                  </button>
                )}
              </div>
            </div>

            {debugAvailable && debugMode && (
              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 font-mono text-xs text-zinc-300">
                <div>Query from/to CRS: {queryView.fromCode || "?"} → {queryView.toCode || "?"}</div>
                <div>Query date/time/window: {queryView.date} {queryView.time} ±{queryView.windowMins}</div>
                <div>State submitted/formValid: {submittedState ? "true" : "false"} / {formValid ? "true" : "false"}</div>
                <div>Fetch loading/error/count: {loading ? "true" : "false"} / {error ?? "none"} / {services.length}</div>
                <div>Time sanity min/max: {minFilterTime ?? "n/a"} / {maxFilterTime ?? "n/a"}</div>
                <div>Time sanity first5 (uid@time): {firstFiveFilterTimes.length === 0
                  ? "none"
                  : firstFiveFilterTimes.map((row) => `${row.uid}@${row.filterTime}`).join(" | ")}</div>
              </div>
            )}

            {loading && (
              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-300">
                Loading journeys…
              </div>
            )}

            {!loading && !error && services.length === 0 && (
              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-300">
                No services found for that window.
              </div>
            )}

            {services.length > 0 && (
              <div className="mt-4 space-y-3">
                {services.map((s) => (
                  <ServiceCard key={s.uid} service={s} />
                ))}
              </div>
            )}
          </section>
        )}

        <footer className="mt-12 text-xs text-zinc-500">
          Next: expandable per-service drawer + eligibility reasoning + operator mapping coverage.
        </footer>
      </div>
    </main>
  );
}
