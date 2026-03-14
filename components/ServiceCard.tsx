"use client";

import { useEffect, useState } from "react";
import type { Service } from "@/hooks/useJourneySearch";

type ServiceCardProps = {
  service: Partial<Service> | null | undefined;
  detailLoading?: boolean;
  detailError?: string | null;
  onExpandDetails?: (service: Partial<Service>) => void | Promise<void>;
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

function statusBasisLabel(basis: Service["statusBasis"]) {
  if (basis === "arrival") return "Arrival timing";
  if (basis === "departure") return "Departure timing";
  if (basis === "raw_status") return "Live board status";
  return "Limited evidence";
}

function confidenceCopy(confidence: Service["statusConfidence"]) {
  if (confidence === "high") {
    return {
      label: "High confidence",
      className: "border-emerald-800/70 bg-emerald-950/30 text-emerald-200",
    };
  }
  if (confidence === "medium") {
    return {
      label: "Medium confidence",
      className: "border-amber-800/70 bg-amber-950/30 text-amber-200",
    };
  }
  return {
    label: "Low confidence",
    className: "border-zinc-800 bg-zinc-900 text-zinc-400",
  };
}

function destinationStopCopy(callsAtTo: boolean | undefined) {
  if (callsAtTo === true) {
    return {
      label: "Calls at selected destination",
      className: "border-emerald-800/70 bg-emerald-950/30 text-emerald-200",
    };
  }
  if (callsAtTo === false) {
    return {
      label: "Destination does not match selected stop",
      className: "border-red-900/70 bg-red-950/30 text-red-200",
    };
  }
  return {
    label: "Destination calling point not confirmed",
    className: "border-zinc-800 bg-zinc-900 text-zinc-400",
  };
}

function eligibilityCopy(service: Partial<Service>) {
  const band = service.eligibilityBand ?? "unknown_delay";

  if (band === "eligible") {
    return {
      label: "Eligible",
      className: "border-emerald-700/60 bg-emerald-950/40 text-emerald-200",
    };
  }

  if (band === "below_threshold") {
    return {
      label: "Not eligible",
      className: "border-zinc-700 bg-zinc-900 text-zinc-300",
    };
  }

  return {
    label: "Eligibility unknown",
    className: "border-zinc-700 bg-zinc-900 text-zinc-400",
  };
}

export default function ServiceCard({
  service,
  detailLoading = false,
  detailError = null,
  onExpandDetails,
}: ServiceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded || !service || !onExpandDetails) return;

    const needsDetailLoad =
      typeof service.uid === "string" &&
      service.uid.length > 0 &&
      service.detailsLoaded !== true &&
      !detailError;

    if (!needsDetailLoad) return;
    void onExpandDetails(service);
  }, [detailError, expanded, onExpandDetails, service]);

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
  const providerSource = typeof service.providerSource === "string" ? service.providerSource : "";
  const claimUrl =
    typeof service.claimUrl === "string" && service.claimUrl.trim().length > 0 ? service.claimUrl : null;
  const isEligible = service.isEligible === true;
  const eligibilityReason =
    typeof service.eligibilityReason === "string" && service.eligibilityReason.trim().length > 0
      ? service.eligibilityReason
      : "Not eligible yet";
  const rawStatusText =
    typeof service.rawStatusText === "string" && service.rawStatusText.trim().length > 0
      ? service.rawStatusText
      : null;
  const statusBasis =
    service.statusBasis === "arrival" ||
    service.statusBasis === "departure" ||
    service.statusBasis === "raw_status" ||
    service.statusBasis === "unknown"
      ? service.statusBasis
      : "unknown";
  const statusConfidence =
    service.statusConfidence === "high" ||
    service.statusConfidence === "medium" ||
    service.statusConfidence === "low"
      ? service.statusConfidence
      : "low";
  const callingPoints = Array.isArray(service.callingPoints) ? service.callingPoints : [];
  const eligibility = eligibilityCopy(service);
  const confidence = confidenceCopy(statusConfidence);
  const destinationStop = destinationStopCopy(callsAtTo);

  const arrival = expectedArrival ?? (aimedArrival || "—");
  const shouldShowClaimCta = (isEligible || status === "Cancelled") && claimUrl;

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
    `Status evidence: ${statusBasisLabel(statusBasis)}`,
    `Status confidence: ${confidence.label}`,
    `Live board detail: ${rawStatusText ?? "Unknown"}`,
    `Eligibility: ${eligibility.label}`,
    `Eligibility reason: ${eligibilityReason}`,
    `Calls at destination: ${callsAtTo == null ? "Unknown" : callsAtTo ? "Yes" : "No"}`,
    `Provider source: ${providerSource || "Unknown"}`,
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

  function toggleExpanded() {
    setExpanded((current) => !current);
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
            <div
              className={[
                "rounded-full border px-2 py-0.5 text-xs font-medium",
                eligibility.className,
              ].join(" ")}
            >
              {eligibility.label}
            </div>
          </div>
          <p className="mt-2 text-sm text-zinc-400">{eligibilityReason}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {shouldShowClaimCta && (
            <a
              href={claimUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-amber-300 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-200"
            >
              Claim Delay Repay from {operatorName}
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
            onClick={toggleExpanded}
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
            <div className="flex flex-wrap items-center gap-2">
              <div
                className={[
                  "rounded-full border px-2 py-1 text-xs font-medium",
                  confidence.className,
                ].join(" ")}
              >
                {confidence.label}
              </div>
              <div
                className={[
                  "rounded-full border px-2 py-1 text-xs font-medium",
                  destinationStop.className,
                ].join(" ")}
              >
                {destinationStop.label}
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Timing evidence
                </h3>
                {detailLoading && (
                  <p className="mt-2 text-xs text-zinc-500">Loading service details…</p>
                )}
                {detailError && <p className="mt-2 text-xs text-red-300">{detailError}</p>}
                <dl className="mt-2 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-zinc-500">Planned departure</dt>
                    <dd className="text-right text-zinc-100">{aimedDeparture}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-zinc-500">Live departure</dt>
                    <dd className="text-right text-zinc-100">{expectedDeparture ?? "—"}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-zinc-500">Planned arrival</dt>
                    <dd className="text-right text-zinc-100">{aimedArrival || "—"}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-zinc-500">Live arrival</dt>
                    <dd className="text-right text-zinc-100">{expectedArrival ?? "—"}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-zinc-500">Delay shown</dt>
                    <dd className="text-right font-medium text-zinc-100">{formatDelay(delayMins)}</dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Service details
                </h3>
                <dl className="mt-2 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-zinc-500">Service UID</dt>
                    <dd className="text-right text-zinc-100">{uid}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-zinc-500">Route</dt>
                    <dd className="text-right text-zinc-100">
                      {originName} → {destinationName}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-zinc-500">Platform</dt>
                    <dd className="text-right text-zinc-100">{platform ?? "—"}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-zinc-500">Delay basis</dt>
                    <dd className="text-right text-zinc-100">{statusBasisLabel(statusBasis)}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-zinc-500">Data source</dt>
                    <dd className="text-right text-zinc-100">{providerSource || "Unknown"}</dd>
                  </div>
                </dl>
              </section>
            </div>

            <section className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Calling points
              </h3>
              {callingPoints.length > 0 ? (
                <ol className="mt-3 space-y-2">
                  {callingPoints.map((point, index) => {
                    const pointKey = `${point.crs ?? point.name}-${index}`;
                    const plannedTime = point.aimedDeparture ?? point.aimedArrival ?? "—";
                    const liveTime = point.expectedDeparture ?? point.expectedArrival ?? "—";

                    return (
                      <li
                        key={pointKey}
                        className="flex items-start justify-between gap-3 border-b border-zinc-800/70 pb-2 last:border-b-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-zinc-100">{point.name}</p>
                          <p className="text-xs text-zinc-500">{point.crs ?? "CRS unavailable"}</p>
                        </div>
                        <div className="shrink-0 text-right text-xs">
                          <p className="text-zinc-400">Planned {plannedTime}</p>
                          <p className="text-zinc-200">Live {liveTime}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="mt-2 text-zinc-400">
                  Calling points are not available for this service.
                </p>
              )}
            </section>

            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Delay Repay check
                </h3>
                <p className="mt-2 text-zinc-100">{eligibility.label}</p>
                <p className="mt-2 text-zinc-400">{eligibilityReason}</p>
              </section>

              <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Live feed note
                </h3>
                <p className="mt-2 text-zinc-100">{rawStatusText ?? "No extra live status text available."}</p>
              </section>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
