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

async function requestText(
  url: string,
  init: RequestInit,
  headers: Record<string, string> = {}
): Promise<{ status: number; ok: boolean; headers: Headers; body: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        ...headers,
        ...(init.headers ?? {}),
      },
      ...init,
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

  if (!res.ok) {
    throw new DarwinHttpError(res.status, raw.slice(0, 300));
  }

  return {
    status: res.status,
    ok: res.ok,
    headers: res.headers,
    body: raw,
  };
}

export async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<unknown> {
  const response = await requestText(
    url,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
      },
    },
    headers
  );
  let parsed: unknown = null;
  try {
    parsed = response.body.length > 0 ? JSON.parse(response.body) : null;
  } catch {
    parsed = null;
  }

  return parsed;
}

export async function postText(
  url: string,
  body: string,
  headers: Record<string, string> = {},
  contentType = "text/xml; charset=utf-8"
) {
  const response = await requestText(
    url,
    {
      method: "POST",
      body,
      headers: {
        "Content-Type": contentType,
      },
    },
    headers
  );
  return response.body;
}

export async function getJson(url: string, headers: Record<string, string> = {}) {
  const response = await requestText(
    url,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    },
    headers
  );

  try {
    return response.body.length > 0 ? JSON.parse(response.body) : null;
  } catch {
    throw new DarwinHttpError(response.status, response.body.slice(0, 300));
  }
}

export async function getText(url: string, headers: Record<string, string> = {}) {
  const response = await requestText(
    url,
    {
      method: "GET",
    },
    headers
  );
  return response.body;
}
