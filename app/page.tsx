"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Service = {
  dep: string; // "HH:mm"
  arr: string; // "HH:mm"
  status: "On time" | "Delayed" | "Cancelled";
};

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function addMinutes(hhmm: string, mins: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  const norm = ((total % 1440) + 1440) % 1440;
  const nh = Math.floor(norm / 60);
  const nm = norm % 60;
  return `${pad(nh)}:${pad(nm)}`;
}

function makeMockServices(anchorTime: string, windowMins: number): Service[] {
  const offsets = [-windowMins, -20, -5, 10, 25, windowMins].sort((a, b) => a - b);
  const statuses: Service["status"][] = ["On time", "On time", "Delayed", "On time", "Cancelled", "On time"];

  return offsets.map((off, i) => {
    const dep = addMinutes(anchorTime, off);
    const duration = 28 + (i % 3) * 6;
    const arr = addMinutes(dep, duration);
    return { dep, arr, status: statuses[i] ?? "On time" };
  });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowHHMM() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Home() {
  const router = useRouter();
  const sp = useSearchParams();

  // Read state from URL (with sensible defaults)
  const fromUrl = sp.get("from") ?? "";
  const toUrl = sp.get("to") ?? "";
  const dateUrl = sp.get("date") ?? todayISO();
  const timeUrl = sp.get("time") ?? nowHHMM();
  const windowUrl = Number(sp.get("window") ?? "30");
  const submitted = sp.get("submitted") === "1";

  // Controlled inputs backed by URL state (so typing is smooth)
  const [from, setFrom] = useState(fromUrl);
  const [to, setTo] = useState(toUrl);
  const [date, setDate] = useState(dateUrl);
  const [time, setTime] = useState(timeUrl);

  const [error, setError] = useState<string | null>(null);

  const windowMins = Number.isFinite(windowUrl) ? Math.min(Math.max(windowUrl, 15), 180) : 30;

  const services = useMemo(() => {
    if (!submitted) return [];
    return makeMockServices(timeUrl, windowMins);
  }, [submitted, timeUrl, windowMins]);

  function updateUrl(next: {
    from?: string;
    to?: string;
    date?: string;
    time?: string;
    window?: number;
    submitted?: boolean;
  }) {
    const params = new URLSearchParams(sp.toString());

    if (next.from !== undefined) params.set("from", next.from);
    if (next.to !== undefined) params.set("to", next.to);
    if (next.date !== undefined) params.set("date", next.date);
    if (next.time !== undefined) params.set("time", next.time);

    if (next.window !== undefined) params.set("window", String(next.window));
    if (next.submitted !== undefined) params.set("submitted", next.submitted ? "1" : "0");

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
    if (f.toLowerCase() === t.toLowerCase()) {
      setError("Departure and arrival stations must be different.");
      return;
    }

    // Commit form inputs to URL, and mark as submitted
    router.replace(
      `/?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}&date=${encodeURIComponent(
        date
      )}&time=${encodeURIComponent(time)}&window=30&submitted=1`
    );
  }

  function onReset() {
    setError(null);
    setFrom("");
    setTo("");
    setDate(todayISO());
    setTime(nowHHMM());
    router.replace(`/`);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight">Check-a-Train</h1>
          <p className="mt-2 text-zinc-400">Quick A → B departures around a time. (Mock data for now.)</p>
        </header>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 shadow-sm">
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm text-zinc-300">Departure station</label>
              <input
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="e.g. Sevenoaks"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-600"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-zinc-300">Arrival station</label>
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="e.g. London Bridge"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-600"
              />
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
                <div className="rounded-xl border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
                >
                  Find trains
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
                  onClick={() => updateUrl({ window: 60, submitted: true })}
                  className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  Earlier (-60 mins)
                </button>
                <button
                  onClick={() => updateUrl({ window: 60, submitted: true })}
                  className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  Later (+60 mins)
                </button>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800">
              <div className="grid grid-cols-3 gap-0 bg-zinc-900/60 px-4 py-2 text-xs uppercase tracking-wide text-zinc-400">
                <div>Depart</div>
                <div>Arrive</div>
                <div>Status</div>
              </div>

              <div className="divide-y divide-zinc-800 bg-zinc-950">
                {services.map((s, idx) => (
                  <div key={idx} className="grid grid-cols-3 px-4 py-3 text-sm">
                    <div className="font-medium">{s.dep}</div>
                    <div>{s.arr}</div>
                    <div
                      className={
                        s.status === "On time"
                          ? "text-zinc-200"
                          : s.status === "Delayed"
                          ? "text-amber-300"
                          : "text-red-300"
                      }
                    >
                      {s.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <footer className="mt-12 text-xs text-zinc-500">
          Next step: replace mock data with an API route, then plug in a real rail data provider.
        </footer>
      </div>
    </main>
  );
}