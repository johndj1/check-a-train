import { NextResponse } from "next/server";
import { getJourneysFromProvider, JourneyProviderError } from "@/lib/providers/journeys-provider";
import { deriveDelayRepayEligibility } from "@/lib/delay-repay/eligibility";
import { resolveOperatorClaimUrl } from "@/lib/operators/claim-links";
import { emitProductSignal, isRealUsageSignalContext } from "@/lib/productos-signal";

function toHHMM(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const text = v.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const from = searchParams.get("from")?.trim();
    const to = searchParams.get("to")?.trim();
    const date = searchParams.get("date")?.trim();
    const timeRaw = searchParams.get("time")?.trim();
    const window = Number(searchParams.get("window") ?? "30");
    const windowMins = Number.isFinite(window) ? Math.min(Math.max(window, 0), 180) : 30;
    const filterDest = searchParams.get("filterDest") === "1";

    if (!from || !to || !date || !timeRaw) {
      return NextResponse.json(
        { error: "Missing required params: from, to, date, time" },
        { status: 400 },
      );
    }

    const time = toHHMM(timeRaw);
    if (!time) {
      return NextResponse.json(
        { error: "Invalid time format. Expected HH:MM." },
        { status: 400 },
      );
    }

    if (!parseISODate(date)) {
      return NextResponse.json(
        { error: "Invalid date format. Expected YYYY-MM-DD." },
        { status: 400 },
      );
    }

    const providerResult = await getJourneysFromProvider({
      from,
      to,
      date,
      time,
      windowMins,
      filterDest,
    });

    const services = providerResult.services.map((service) => {
      const eligibility = deriveDelayRepayEligibility({
        delayMins: service.delayMins,
      });
      const claimUrl = resolveOperatorClaimUrl(service.operator, service.operatorName);

      return {
        ...service,
        claimUrl,
        isEligible: eligibility.isEligible,
        eligibilityReason: eligibility.eligibilityReason,
        eligibilityBand: eligibility.eligibilityBand,
      };
    });

    const matchedService =
      providerResult.selectedService === null
        ? null
        : services.find((service) => service.uid === providerResult.selectedService?.uid) ?? null;
    const matchedServiceIsDelayed = Boolean(
      matchedService &&
        matchedService.isEligible,
    );

    if (matchedService && matchedServiceIsDelayed && isRealUsageSignalContext(providerResult.source)) {
      void emitProductSignal("delay_detected", {
        from,
        to,
        date,
        time,
        window_mins: windowMins,
        provider_source: providerResult.source,
        journey_stage: "delayed_service_presented",
        user_outcome: "claim_opportunity_identified",
        matched_service: true,
        service_uid: matchedService.uid,
        operator: matchedService.operator,
        operator_name: matchedService.operatorName,
        operator_known: Boolean(matchedService.operator),
        origin_name: matchedService.originName,
        destination_name: matchedService.destinationName,
        status: providerResult.firstPassStatus.status,
        delay_mins: providerResult.firstPassStatus.delayMins,
        status_basis: providerResult.firstPassStatus.basis,
        status_confidence: providerResult.firstPassStatus.confidence,
        aimed_departure: matchedService.aimedDeparture,
        expected_departure: matchedService.expectedDeparture,
        aimed_arrival: matchedService.aimedArrival,
        expected_arrival: matchedService.expectedArrival,
      });
    }

    return NextResponse.json({
      query: { from, to, date, time, window: windowMins },
      services,
      selectedService: matchedService,
      firstPassStatus: providerResult.firstPassStatus,
      diagnostics: providerResult.diagnostics ?? null,
      source: providerResult.source,
      note: providerResult.note,
    });
  } catch (err) {
    if (err instanceof JourneyProviderError) {
      return NextResponse.json(
        {
          error: err.publicMessage,
          retryable: err.retryable,
          failureClass: err.failureClass,
        },
        { status: err.status },
      );
    }

    console.error("❌ /api/journeys error:", err);
    return NextResponse.json(
      {
        error: "Something went wrong while loading journeys. Please try again.",
        retryable: true,
      },
      { status: 500 },
    );
  }
}
