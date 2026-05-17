type SupabaseRequestOptions = {
  method?: "GET" | "POST";
  query?: Record<string, string>;
  body?: unknown;
  prefer?: string;
};

export async function supabaseRequest<T>(
  path: string,
  { method = "GET", query, body, prefer }: SupabaseRequestOptions = {}
) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Copy .env.local.example to .env.local and use the service_role key from supabase status."
    );
  }

  const url = new URL(`/rest/v1/${path}`, baseUrl);

  for (const [key, value] of Object.entries(query || {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${message}`);
  }

  const text = await response.text();

  if (response.status === 204 || text.length === 0) {
    return null as T;
  }

  return JSON.parse(text) as T;
}
