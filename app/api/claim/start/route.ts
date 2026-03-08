import { NextResponse } from "next/server";
import { getOperator } from "@/lib/operators";
import { emitProductSignal } from "@/lib/productos-signal";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const operatorCode = searchParams.get("operator")?.trim() ?? "";
  const serviceUid = searchParams.get("serviceUid")?.trim() ?? "";
  const originName = searchParams.get("originName")?.trim() ?? "";
  const destinationName = searchParams.get("destinationName")?.trim() ?? "";
  const status = searchParams.get("status")?.trim() ?? "";
  const delayMinsRaw = searchParams.get("delayMins")?.trim() ?? "";

  const operator = getOperator(operatorCode);
  if (!operator) {
    return NextResponse.json({ error: "Unknown operator." }, { status: 400 });
  }

  const delayMins =
    delayMinsRaw.length > 0 && Number.isFinite(Number(delayMinsRaw)) ? Number(delayMinsRaw) : null;

  void emitProductSignal("claim_started", {
    operator: operator.code,
    operator_name: operator.name,
    service_uid: serviceUid || null,
    origin_name: originName || null,
    destination_name: destinationName || null,
    status: status || null,
    delay_mins: delayMins,
    claim_url: operator.delayRepayUrl,
  });

  return NextResponse.redirect(operator.delayRepayUrl);
}
