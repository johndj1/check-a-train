export function buildBasicAuthHeader(user: string, pass: string) {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

const REQUEST_TIMEOUT_MS = 5000;

export class DarwinTimeoutError extends Error {
  constructor(message = "Darwin request timed out.") {
    super(message);
    this.name = "DarwinTimeoutError";
  }
}

export class DarwinHttpError extends Error {
  status: number;
  bodyPreview: string;

  constructor(status: number, bodyPreview: string) {
    super(`Darwin request failed (${status}).`);
    this.name = "DarwinHttpError";
    this.status = status;
    this.bodyPreview = bodyPreview;
  }
}

export async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new DarwinTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const raw = await res.text();
  let parsed: unknown = null;
  try {
    parsed = raw.length > 0 ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const preview =
      typeof parsed === "object" && parsed !== null
        ? JSON.stringify(parsed).slice(0, 300)
        : raw.slice(0, 300);
    throw new DarwinHttpError(res.status, preview);
  }

  return parsed;
}
