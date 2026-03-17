import { API_BASE_URL } from "./config.js";
import { loadCredentials } from "./credentials.js";

export async function apiRequest(
  method: string,
  pathTemplate: string,
  pathParams: Record<string, string>,
  queryParams: Record<string, string>,
  bodyParams: Record<string, unknown>,
  fixedBody?: Record<string, unknown>,
): Promise<{ data: unknown; status: number }> {
  const creds = loadCredentials();
  if (!creds) {
    console.log(JSON.stringify({ error: "Not logged in. Run: ai-todo login" }));
    process.exit(2);
  }

  let path = pathTemplate;
  for (const [key, value] of Object.entries(pathParams)) {
    path = path.replace(`:${key}`, encodeURIComponent(value));
  }

  const url = new URL(path, API_BASE_URL);
  for (const [key, value] of Object.entries(queryParams)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${creds.session_token || creds.access_token}`,
  };

  let body: string | undefined;
  const mergedBody = { ...bodyParams, ...fixedBody };
  if (method !== "GET" && method !== "DELETE" && Object.keys(mergedBody).length > 0) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(mergedBody);
  }

  const res = await fetch(url.toString(), { method, headers, body });

  if (res.status === 401) {
    console.log(JSON.stringify({ error: "Unauthorized. Run: ai-todo login" }));
    process.exit(2);
  }

  if (res.status === 204) {
    return { data: { success: true }, status: 204 };
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.log(JSON.stringify({ error: data.error ?? "Request failed", status: res.status }));
    process.exit(1);
  }

  return { data, status: res.status };
}
