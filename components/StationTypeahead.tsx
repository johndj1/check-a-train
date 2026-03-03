"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type Station = { name: string; code: string };

type Props = {
  label: string;
  placeholder?: string;
  value: string; // what the user sees in the box (station name)
  onChange: (nextValue: string) => void; // typing
  onSelect: (station: Station) => void; // picking a suggestion
};

type StationsApiResponse = {
  query: string;
  results: Station[];
};

function useDebounced<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

export default function StationTypeahead({
  label,
  placeholder,
  value,
  onChange,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Station[]>([]);
  const [loading, setLoading] = useState(false);

  const debounced = useDebounced(value, 200);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const shouldQuery = useMemo(() => debounced.trim().length >= 2, [debounced]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!shouldQuery) {
        setResults([]);
        return;
      }

      setLoading(true);

      try {
        const res = await fetch(`/api/stations?q=${encodeURIComponent(debounced.trim())}`);
        const data = (await res.json()) as StationsApiResponse;

        if (!cancelled) {
          setResults(data.results ?? []);
        }
      } catch {
        if (!cancelled) {
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [debounced, shouldQuery]);

  // Close dropdown if user clicks outside component
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current) return;
      if (boxRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="space-y-2" ref={boxRef}>
      <label className="text-sm text-zinc-300">{label}</label>

      <div className="relative">
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-600"
          autoComplete="off"
        />

        {open && (loading || results.length > 0) && (
          <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-lg">
            {loading && (
              <div className="px-3 py-2 text-sm text-zinc-400">Searching…</div>
            )}

            {!loading && results.length === 0 && (
              <div className="px-3 py-2 text-sm text-zinc-400">No matches</div>
            )}

            {!loading &&
              results.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => {
                    onSelect(s);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-900"
                >
                  <span className="text-zinc-100">{s.name}</span>
                  <span className="text-xs text-zinc-400">{s.code}</span>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}