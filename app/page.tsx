"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import StationTypeahead, { type Station } from "@/components/StationTypeahead";
import { useJourneySearch, type Service } from "@/hooks/useJourneySearch";
import { getOperator } from "@/lib/operators";

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

function shiftTimeHHMM(time: string, deltaMinutes: number) {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return time;

  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return time;

  let total = hh * 60 + mm + deltaMinutes;
  total = ((total % 1440) + 1440) % 1440;

  const newH = Math.floor(total / 60);
  const newM = total % 60;
  return `${pad(newH)}:${pad(newM)}`;
}

function formatDelay(delayMins: number | null) {
  if (delayMins === null) return "—";
  if (delayMins <= 0) return "0m";
  return `${delayMins}m`;
}

function statusClass(status: Service["status"]) {
  if (status === "On time") return "text-zinc-200";
  if (status === "Delayed") return "text-amber-300";
  return "text-red-300";
}

export default function Home() {
  const router = useRouter();
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

  const windowMins = Number.isFinite(windowUrl) ? Math.min(Math.max(windowUrl, 15), 180) : 30;

  // Source-of-truth validation: must pick from dropdown
  const formValid = !!fromCode && !!toCode;

  const fromParam = fromCode || fromUrl;
  const toParam = toCode || toUrl;

  const { services, loading, error, setError } = useJourneySearch({
    submitted,
    formValid,
    from: fromParam,
    to: toParam,
    date: dateUrl,
    time: timeUrl,
    windowMins,
  });

  // Keep codes synced from URL (so refresh/share works)
  useEffect(() => {
    const fc = sp.get("fromCode") ?? "";
    if (fc !== fromCode) setFromCode(fc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  useEffect(() => {
    const tc = sp.get("toCode") ?? "";
    if (tc !== toCode) setToCode(tc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  function updateUrl(next: { window?: number; submitted?: boolean }) {
    const params = new URLSearchParams(sp.toString());
    if (next.window !== undefined) params.set("window", String(next.window));
    if (next.submitted !== undefined) params.set("submitted", next.submitted ? "1" : "0");
    router.replace(`/?${params.toString()}`);
  }

  function updateTimeInUrl(deltaMinutes: number) {
    const params = new URLSearchParams(sp.toString());
    const currentTime = params.get("time") ?? timeUrl;
    params.set("time", shiftTimeHHMM(currentTime, deltaMinutes));
    params.set("submitted", "1");
    router.replace(`/?${params.toString()}`);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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

    router.replace(
      `/?from=${encodeURIComponent(f)}&fromCode=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(
        t
      )}&toCode=${encodeURIComponent(toCode)}&date=${encodeURIComponent(date)}&time=${encodeURIComponent(
        time
      )}&window=30&submitted=1`
    );
  }

  function onReset() {
    setError(null);
    setFrom("");
    setTo("");
    setFromCode("");
    setToCode("");
    setDate(todayISO());
    setTime(nowHHMM());
    router.replace(`/`);
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
            <StationTypeahead
              label="Departure station"
              placeholder="e.g. Sevenoaks"
              value={from}
              onChange={(v) => {
                setFrom(v);
                setFromCode("");
              }}
              onSelect={(s: Station) => {
                setFrom(s.name);
                setFromCode(s.code);
              }}
            />

            <StationTypeahead
              label="Arrival station"
              placeholder="e.g. London Bridge"
              value={to}
              onChange={(v) => {
                setTo(v);
                setToCode("");
              }}
              onSelect={(s: Station) => {
                setTo(s.name);
                setToCode(s.code);
              }}
            />

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
                <div className="rounded-xl border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                  {error}
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

        {submitted && (
          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {fromUrl || from.trim()} → {toUrl || to.trim()}
                </h2>
                <p className="text-sm text-zinc-400">
                  {dateUrl} · window ±{windowMins} minutes around {timeUrl}
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
              </div>
            </div>

            {loading && (
              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-300">
                Loading journeys…
              </div>
            )}

            {!loading && services.length === 0 && (
              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-300">
                No services found for that window.
              </div>
            )}

            {services.length > 0 && (
              <div className="mt-4 space-y-3">
                {services.map((s) => {
                  const op = getOperator(s.operator);
                  const eligible =
                    !!op && s.delayMins !== null && s.delayMins >= op.minDelayMins && s.status !== "Cancelled";

                  return (
                    <div
                      key={s.uid}
                      className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-base font-semibold">
                              {s.originName} → {s.destinationName}
                            </div>
                            <div className="text-xs text-zinc-500">·</div>
                            <div className="text-sm text-zinc-300">
                              {s.operatorName}
                              {s.platform ? ` · Platform ${s.platform}` : ""}
                            </div>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                            <div>
                              <span className="text-zinc-400">Aimed:</span>{" "}
                              <span className="font-medium">{s.aimedDeparture}</span>
                            </div>
                            <div>
                              <span className="text-zinc-400">Expected:</span>{" "}
                              <span className="font-medium">
                                {s.expectedDeparture ?? "—"}
                              </span>
                            </div>
                            <div>
                              <span className="text-zinc-400">Delay:</span>{" "}
                              <span className="font-medium">{formatDelay(s.delayMins)}</span>
                            </div>
                            <div className={["font-semibold", statusClass(s.status)].join(" ")}>
                              {s.status}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 flex flex-col items-end gap-2">
                          {eligible ? (
                            <a
                              href={op!.delayRepayUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
                            >
                              Start claim
                            </a>
                          ) : (
                            <div className="text-xs text-zinc-500 text-right">
                              {op
                                ? `Claim likely from ${op.minDelayMins}m+`
                                : "Operator claim link not mapped"}
                            </div>
                          )}

                          {/* Placeholder for drawer toggle later */}
                          <button
                            type="button"
                            className="rounded-xl border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800"
                            onClick={() => {
                              // tomorrow: expand/collapse drawer
                              // For now: no-op
                            }}
                          >
                            Details
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
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