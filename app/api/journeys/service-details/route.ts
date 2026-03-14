import { NextResponse } from "next/server";
import { deriveDelayRepayEligibility } from "@/lib/delay-repay/eligibility";
import { enrichHspService } from "@/lib/darwin/hsp";
import { deriveFirstPassStatus } from "@/lib/darwin/match";
import type { DarwinNormalizedService } from "@/lib/darwin/types";
import { resolveOperatorClaimUrl } from "@/lib/operators/claim-links";
import { JourneyProviderError } from "@/lib/providers/journeys-provider";

function isHistoricalHspUid(uid: string) {
  return uid.startsWith("HSP:") && uid.length > 4;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get("uid")?.trim() ?? "";
    const from = searchParams.get("from")?.trim() ?? "";
    const to = searchParams.get("to")?.trim() ?? "";

    if (!uid || !from || !to) {
      return NextResponse.json(
        { error: "Missing required params: uid, from, to" },
        { status: 400 },
      );
    }

    if (!isHistoricalHspUid(uid)) {
      return NextResponse.json(
        { error: "Only historical HSP services support lazy detail enrichment." },
        { status: 400 },
      );
    }

    const baseService: DarwinNormalizedService = {
      uid,
      operator: null,
      operatorName: "Unknown",
      claimUrl: null,
      platform: null,
      originName: from.toUpperCase(),
      destinationName: to.toUpperCase(),
      aimedDeparture: null,
      expectedDeparture: null,
      aimedArrival: "",
      expectedArrival: null,
      delayMins: null,
      status: "Unknown",
    };

    const enriched = await enrichHspService(baseService, { from, to });
    const firstPassStatus = deriveFirstPassStatus(enriched);
    const eligibility = deriveDelayRepayEligibility({
      delayMins: enriched.delayMins,
    });
    const claimUrl = resolveOperatorClaimUrl(enriched.operator, enriched.operatorName);

    return NextResponse.json({
      service: {
        aimedDeparture: enriched.aimedDeparture,
        expectedDeparture: enriched.expectedDeparture,
        aimedArrival: enriched.aimedArrival,
        expectedArrival: enriched.expectedArrival,
        delayMins: enriched.delayMins,
        status: enriched.status,
        callsAtTo: enriched.callsAtTo,
        rawStatusText: enriched.rawStatusText,
        statusBasis: firstPassStatus.basis,
        statusConfidence: firstPassStatus.confidence,
        claimUrl,
        isEligible: eligibility.isEligible,
        eligibilityReason: eligibility.eligibilityReason,
        eligibilityBand: eligibility.eligibilityBand,
      },
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

    console.error("❌ /api/journeys/service-details error:", err);
    return NextResponse.json(
      {
        error: "Something went wrong while loading service details. Please try again.",
        retryable: true,
      },
      { status: 500 },
    );
  }
}
