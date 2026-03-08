"use client";

import { useState } from "react";
import type { Service } from "@/hooks/useJourneySearch";
import { getOperator } from "@/lib/operators";

type ServiceCardProps = {
  service: Partial<Service> | null | undefined;
};

function formatDelay(delayMins: number | null) {
  if (delayMins === null) return "—";
  if (delayMins <= 0) return "0m";
  return `${delayMins}m`;
}

function statusClass(status: Service["status"]) {
  if (status === "On time") return "text-zinc-200";
  if (status === "Delayed") return "text-amber-300";
  if (status === "Unknown") return "text-zinc-400";
  return "text-red-300";
}

export default function ServiceCard({ service }: ServiceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  if (!service) return null;

  const uid = service.uid ?? "unknown-service";
  const originName = service.originName ?? "Unknown origin";
  const destinationName = service.destinationName ?? "Unknown destination";
  const operatorName = service.operatorName ?? "Unknown operator";
  const platform = service.platform ?? null;
  const aimedDeparture = service.aimedDeparture ?? "—";
  const expectedDeparture = service.expectedDeparture ?? null;
  const aimedArrival = service.aimedArrival ?? "";
  const expectedArrival = service.expectedArrival ?? null;
  const callsAtTo = service.callsAtTo;
  const status: Service["status"] =
    service.status === "On time" ||
    service.status === "Delayed" ||
    service.status === "Cancelled" ||
    service.status === "Unknown"
      ? service.status
      : "Unknown";
  const delayMins =
    status !== "Cancelled" && typeof service.delayMins === "number" ? service.delayMins : null;
  const operator = getOperator(service.operator);

  const arrival = expectedArrival ?? (aimedArrival || "—");
  const claimHref = operator
    ? `/api/claim/start?${new URLSearchParams({
        operator: operator.code,
        serviceUid: uid,
        originName,
        destinationName,
        status,
        delayMins: delayMins === null ? "" : String(delayMins),
      }).toString()}`
    : null;

  const claimPack = [
    `Service UID: ${uid}`,
    `Route: ${originName} -> ${destinationName}`,
    `Operator: ${operatorName}`,
    `Platform: ${platform ?? "Unknown"}`,
    `Status: ${status}`,
    `Aimed departure: ${aimedDeparture}`,
    `Expected departure: ${expectedDeparture ?? "Unknown"}`,
    `Aimed arrival: ${aimedArrival || "Unknown"}`,
    `Expected arrival: ${expectedArrival ?? "Unknown"}`,
    `Delay: ${formatDelay(delayMins)}`,
    `Calls at destination: ${callsAtTo == null ? "Unknown" : callsAtTo ? "Yes" : "No"}`,
  ].join("\n");

  async function onCopyDetails() {
    try {
      await navigator.clipboard.writeText(claimPack);
      setCopyMessage("Copied");
    } catch {
      setCopyMessage("Copy failed");
    }

    window.setTimeout(() => setCopyMessage(null), 2000);
  }

  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-zinc-100">{aimedDeparture}</span>
            <span className="text-zinc-500">→</span>
            <span className="font-semibold text-zinc-100">{arrival}</span>
            <span className="text-zinc-500">·</span>
            <span className="text-zinc-300">{operatorName}</span>
            {platform && <span className="text-zinc-400">Platform {platform}</span>}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <div className={["font-semibold", statusClass(status)].join(" ")}>{status}</div>
            <div>
              <span className="text-zinc-400">Delay:</span>{" "}
              <span className="font-medium text-zinc-200">{formatDelay(delayMins)}</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {claimHref && (
            <a
              href={claimHref}
              className="rounded-xl bg-amber-300 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-200"
            >
              Claim Delay Repay
            </a>
          )}

          <button
            type="button"
            onClick={onCopyDetails}
            className="rounded-xl border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800"
          >
            Copy details
          </button>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={`service-details-${uid}`}
            className="rounded-xl border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800"
          >
            {expanded ? "Hide details" : "Show details"}
          </button>
        </div>
      </div>

      {copyMessage && <p className="mt-2 text-xs text-zinc-400">{copyMessage}</p>}

      <div
        id={`service-details-${uid}`}
        className={[
          "grid overflow-hidden transition-all duration-200 ease-out",
          expanded ? "mt-3 grid-rows-[1fr]" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="min-h-0">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-sm text-zinc-300">
            <div>
              <span className="text-zinc-400">UID:</span> {uid}
            </div>
            <div>
              <span className="text-zinc-400">Origin:</span> {originName}
            </div>
            <div>
              <span className="text-zinc-400">Destination:</span> {destinationName}
            </div>
            <div>
              <span className="text-zinc-400">Aimed departure:</span> {aimedDeparture}
            </div>
            <div>
              <span className="text-zinc-400">Expected departure:</span> {expectedDeparture ?? "—"}
            </div>
            <div>
              <span className="text-zinc-400">Aimed arrival:</span> {aimedArrival || "—"}
            </div>
            <div>
              <span className="text-zinc-400">Expected arrival:</span> {expectedArrival ?? "—"}
            </div>
            <div>
              <span className="text-zinc-400">Delay:</span> {formatDelay(delayMins)}
            </div>
            <div>
              <span className="text-zinc-400">Calls at destination:</span>{" "}
              {callsAtTo == null ? "Unknown" : callsAtTo ? "Yes" : "No"}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
