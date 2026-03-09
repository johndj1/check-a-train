const PRODUCT_SLUG = "check-a-train";
const REQUEST_TIMEOUT_MS = 1500;
const LIVE_PROVIDER_SOURCE_PREFIX = "darwin.hsp";

export type ProductSignalMetadata = Record<string, unknown>;

type ProductSignalBody = {
  product_slug: string;
  signal_name: string;
  timestamp: string;
  metadata: ProductSignalMetadata;
};

export function canEmitProductSignals() {
  return Boolean(process.env.PRODUCT_OS_SIGNAL_ENDPOINT?.trim());
}

export function isRealUsageSignalContext(source: string | null | undefined) {
  return typeof source === "string" && source.startsWith(LIVE_PROVIDER_SOURCE_PREFIX);
}

export async function emitProductSignal(signalName: string, payload: ProductSignalMetadata = {}) {
  const endpoint = process.env.PRODUCT_OS_SIGNAL_ENDPOINT?.trim();

  if (!endpoint) {
    console.warn(`[Product OS] signal skipped (${signalName}): PRODUCT_OS_SIGNAL_ENDPOINT is not configured.`);
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const body: ProductSignalBody = {
    product_slug: PRODUCT_SLUG,
    signal_name: signalName,
    timestamp: new Date().toISOString(),
    metadata: payload,
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const preview = text.trim().slice(0, 200);
      console.warn(
        `[Product OS] signal failed (${signalName}): ${response.status} ${response.statusText}${preview ? ` - ${preview}` : ""}.`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn(`[Product OS] signal failed (${signalName}): ${message}.`);
  } finally {
    clearTimeout(timeout);
  }
}
