import { NextResponse } from "next/server";
import { getOperator } from "@/lib/operators";
import { emitProductSignal, isRealUsageSignalContext } from "@/lib/productos-signal";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const operatorCode = searchParams.get("operator")?.trim() ?? "";
  const serviceUid = searchParams.get("serviceUid")?.trim() ?? "";
  const originName = searchParams.get("originName")?.trim() ?? "";
  const destinationName = searchParams.get("destinationName")?.trim() ?? "";
  const status = searchParams.get("status")?.trim() ?? "";
  const delayMinsRaw = searchParams.get("delayMins")?.trim() ?? "";
  const providerSource = searchParams.get("providerSource")?.trim() ?? "";

  const operator = getOperator(operatorCode);
  if (!operator) {
    return NextResponse.json({ error: "Unknown operator." }, { status: 400 });
  }

  const delayMins =
    delayMinsRaw.length > 0 && Number.isFinite(Number(delayMinsRaw)) ? Number(delayMinsRaw) : null;

  if (isRealUsageSignalContext(providerSource)) {
    void emitProductSignal("claim_started", {
      operator: operator.code,
      operator_name: operator.name,
      service_uid: serviceUid || null,
      origin_name: originName || null,
      destination_name: destinationName || null,
      status: status || null,
      delay_mins: delayMins,
      claim_url: operator.delayRepayUrl,
      provider_source: providerSource,
      journey_stage: "claim_handoff_started",
      user_outcome: "operator_claim_redirect_started",
    });
  }

  return NextResponse.redirect(operator.delayRepayUrl);
}
