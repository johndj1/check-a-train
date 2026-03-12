import { getFixtureJourneys } from "@/lib/darwin/fixture";
import { DarwinHttpError, DarwinTimeoutError } from "@/lib/darwin/client";
import { DarwinCredentialsError, fetchDarwinDepartureBoard } from "@/lib/darwin/ldbws";
import { emitProductSignal } from "@/lib/productos-signal";
import type {
  DarwinFirstPassStatus,
  DarwinMatchingDiagnostics,
  DarwinNormalizedService,
} from "@/lib/darwin/types";

export type JourneyProviderQuery = {
  from: string;
  to: string;
  date: string;
  time: string;
  windowMins: number;
  filterDest: boolean;
};

export type JourneyProviderResult = {
  services: DarwinNormalizedService[];
  selectedService: DarwinNormalizedService | null;
  firstPassStatus: DarwinFirstPassStatus;
  diagnostics?: DarwinMatchingDiagnostics;
  source: string;
  note: string;
};

export type JourneyProviderFailureClass =
  | "credentials_missing"
  | "timeout"
  | "rate_limited"
  | "provider_unavailable"
  | "provider_rejected_request"
  | "unexpected";

type JourneyProviderFailure = {
  failureClass: JourneyProviderFailureClass;
  retryable: boolean;
  status: number;
  publicMessage: string;
  technicalMessage: string;
  upstreamStatus: number | null;
};

export class JourneyProviderError extends Error {
  status: number;
  retryable: boolean;
  failureClass: JourneyProviderFailureClass;
  publicMessage: string;
  technicalMessage: string;
  upstreamStatus: number | null;

  constructor(failure: JourneyProviderFailure) {
    super(failure.technicalMessage);
    this.name = "JourneyProviderError";
    this.status = failure.status;
    this.retryable = failure.retryable;
    this.failureClass = failure.failureClass;
    this.publicMessage = failure.publicMessage;
    this.technicalMessage = failure.technicalMessage;
    this.upstreamStatus = failure.upstreamStatus;
  }
}

function parseISODate(dateStr: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

function toHHMM(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function classifyDarwinFailure(error: unknown): JourneyProviderFailure {
  if (error instanceof DarwinCredentialsError) {
    return {
      failureClass: "credentials_missing",
      retryable: false,
      status: 503,
      publicMessage: "Live train data is unavailable right now. Please try again later.",
      technicalMessage: error.message,
      upstreamStatus: null,
    };
  }

  if (error instanceof DarwinTimeoutError) {
    return {
      failureClass: "timeout",
      retryable: true,
      status: 503,
      publicMessage: "Live train data is taking too long to respond. Please try again.",
      technicalMessage: error.message,
      upstreamStatus: null,
    };
  }

  if (error instanceof DarwinHttpError) {
    if (error.status === 429) {
      return {
        failureClass: "rate_limited",
        retryable: true,
        status: 503,
        publicMessage: "Live train data is busy right now. Please try again shortly.",
        technicalMessage: `${error.message} ${error.bodyPreview}`.trim(),
        upstreamStatus: error.status,
      };
    }

    if (error.status >= 500) {
      return {
        failureClass: "provider_unavailable",
        retryable: true,
        status: 503,
        publicMessage: "Live train data is unavailable right now. Please try again.",
        technicalMessage: `${error.message} ${error.bodyPreview}`.trim(),
        upstreamStatus: error.status,
      };
    }

    return {
      failureClass: "provider_rejected_request",
      retryable: false,
      status: 502,
      publicMessage: "We couldn't load live train data for this search right now.",
      technicalMessage: `${error.message} ${error.bodyPreview}`.trim(),
      upstreamStatus: error.status,
    };
  }

  return {
    failureClass: "unexpected",
    retryable: true,
    status: 503,
    publicMessage: "We couldn't load live train data right now. Please try again.",
    technicalMessage: error instanceof Error ? error.message : "Unknown Darwin provider error",
    upstreamStatus: null,
  };
}

async function getLiveBoardJourneys(query: JourneyProviderQuery): Promise<JourneyProviderResult> {
  try {
    return await fetchDarwinDepartureBoard({
      from: query.from,
      to: query.to,
      date: query.date,
      time: query.time,
      windowMins: query.windowMins,
    });
  } catch (err) {
    const failure = classifyDarwinFailure(err);

    void emitProductSignal("darwin_api_error", {
      from: query.from,
      to: query.to,
      date: query.date,
      time: query.time,
      window_mins: query.windowMins,
      provider: "darwin.gateway",
      failure_class: failure.failureClass,
      retryable: failure.retryable,
      endpoint_context: "journey_search",
      journey_stage: "journey_lookup_failed",
      user_outcome: "live_results_unavailable",
      upstream_status: failure.upstreamStatus,
      technical_message: failure.technicalMessage,
    });

    console.error("[journeys-provider] live Darwin lookup failed", {
      from: query.from,
      to: query.to,
      date: query.date,
      time: query.time,
      failureClass: failure.failureClass,
      retryable: failure.retryable,
      upstreamStatus: failure.upstreamStatus,
      technicalMessage: failure.technicalMessage,
    });

    throw new JourneyProviderError(failure);
  }
}

export async function getJourneysFromProvider(query: JourneyProviderQuery): Promise<JourneyProviderResult> {
  if (!parseISODate(query.date)) {
    throw new JourneyProviderError({
      failureClass: "provider_rejected_request",
      retryable: false,
      status: 400,
      publicMessage: "Invalid date format. Expected YYYY-MM-DD.",
      technicalMessage: "Invalid date format. Expected YYYY-MM-DD.",
      upstreamStatus: null,
    });
  }
  const normalizedTime = toHHMM(query.time);
  if (!normalizedTime) {
    throw new JourneyProviderError({
      failureClass: "provider_rejected_request",
      retryable: false,
      status: 400,
      publicMessage: "Invalid time format. Expected HH:MM.",
      technicalMessage: "Invalid time format. Expected HH:MM.",
      upstreamStatus: null,
    });
  }

  const darwinMode = (process.env.DARWIN_MODE ?? "fixture").trim().toLowerCase();
  let result: JourneyProviderResult;

  if (darwinMode === "fixture") {
    result = await getFixtureJourneys({
      from: query.from,
      to: query.to,
      date: query.date,
      time: normalizedTime,
      windowMins: query.windowMins,
    });
  } else if (darwinMode === "live") {
    result = await getLiveBoardJourneys({ ...query, time: normalizedTime });
  } else if (darwinMode === "off") {
    throw new JourneyProviderError({
      failureClass: "provider_unavailable",
      retryable: false,
      status: 503,
      publicMessage: "Live train data is unavailable right now. Please try again later.",
      technicalMessage:
        "Darwin provider is disabled (DARWIN_MODE=off). Set DARWIN_MODE=fixture or DARWIN_MODE=live.",
      upstreamStatus: null,
    });
  } else {
    throw new JourneyProviderError({
      failureClass: "unexpected",
      retryable: false,
      status: 500,
      publicMessage: "Live train data is unavailable right now. Please try again later.",
      technicalMessage: `Unsupported DARWIN_MODE='${darwinMode}'. Expected one of: fixture, live, off.`,
      upstreamStatus: null,
    });
  }

  if (process.env.NODE_ENV === "development") {
    console.log("journeys provider", {
      chosenSource: result.source,
      date: query.date,
      requestedTime: normalizedTime,
      windowMins: query.windowMins,
      afterCount: result.services.length,
      selectedServiceUid: result.selectedService?.uid ?? null,
      firstPassStatus: result.firstPassStatus,
      diagnostics: result.diagnostics ?? null,
    });
  }

  return result;
}
