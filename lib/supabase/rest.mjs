function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function buildRestUrl(baseUrl, table, queryParams) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const url = new URL(`${normalizedBaseUrl}/rest/v1/${table}`);

  if (queryParams instanceof URLSearchParams) {
    url.search = queryParams.toString();
  }

  return url.toString();
}

export function getSupabaseServerConfigFromEnv() {
  return {
    baseUrl: requireEnv("SUPABASE_URL"),
    apiKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export async function supabaseRestRequest({
  baseUrl,
  apiKey,
  method = "GET",
  table,
  queryParams,
  body,
  prefer,
}) {
  const response = await fetch(buildRestUrl(baseUrl, table, queryParams), {
    method,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Prefer: prefer ?? (method === "GET" ? "return=representation" : "return=minimal"),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase ${method} ${table} failed (${response.status}): ${errorText}`);
  }

  if (response.status === 204) {
    return null;
  }

  const responseText = await response.text();

  if (responseText.trim() === "") {
    return null;
  }

  return JSON.parse(responseText);
}
