"use client";

import { useRouter, useSearchParams } from "next/navigation";

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

export function useJourneyParams() {
  const router = useRouter();
  const sp = useSearchParams();

  const params = {
    from: sp.get("from") ?? "",
    to: sp.get("to") ?? "",
    fromCode: sp.get("fromCode") ?? "",
    toCode: sp.get("toCode") ?? "",
    date: sp.get("date") ?? todayISO(),
    time: sp.get("time") ?? nowHHMM(),
    window: Number(sp.get("window") ?? "30"),
    submitted: sp.get("submitted") === "1",
  };

  function replace(next: Record<string, string | number | boolean>) {
    const newParams = new URLSearchParams(sp.toString());

    Object.entries(next).forEach(([k, v]) => {
      if (typeof v === "boolean") {
        newParams.set(k, v ? "1" : "0");
      } else {
        newParams.set(k, String(v));
      }
    });

    router.replace(`/?${newParams.toString()}`);
  }

  function reset() {
    router.replace("/");
  }

  return {
    params,
    replace,
    reset,
  };
}