export function buildBasicAuthHeader(user: string, pass: string) {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

export async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

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
    throw new Error(`Darwin request failed (${res.status}): ${preview}`);
  }

  return parsed;
}
