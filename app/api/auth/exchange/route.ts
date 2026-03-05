import { NextRequest, NextResponse } from "next/server";
import { AUTH_ISSUER } from "@/lib/auth-config";

export const preferredRegion = "hkg1";

type UpstreamResponse = {
  [key: string]: unknown;
  error?: unknown;
  message?: unknown;
};

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function getSetCookieValues(headers: Headers): string[] {
  const headerBag = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = headerBag.getSetCookie?.() ?? [];
  if (setCookies.length > 0) return setCookies;

  const fallback = headers.get("set-cookie");
  return fallback ? [fallback] : [];
}

function appendSetCookieHeaders(res: NextResponse, values: string[]) {
  for (const value of values) {
    res.headers.append("set-cookie", value);
  }
}

/**
 * Server-side relay for the auth server's /api/auth/refresh endpoint.
 * The browser cannot call the auth server directly due to CORS restrictions,
 * so this route proxies the request server-side, forwarding all cookies so
 * the auth server can read the shared-domain refresh_token (e.g. .stringzhao.life).
 */
export async function POST(req: NextRequest) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  const cookie = req.headers.get("cookie");
  if (cookie) headers.cookie = cookie;

  try {
    const upstreamRes = await fetch(new URL("/api/auth/refresh", AUTH_ISSUER), {
      method: "POST",
      headers,
      body: "{}",
      cache: "no-store",
    });
    const data = (await upstreamRes.json().catch(() => ({}))) as UpstreamResponse;
    const setCookies = getSetCookieValues(upstreamRes.headers);

    if (!upstreamRes.ok) {
      const relayRes = NextResponse.json(
        {
          error: "refresh_failed",
          upstreamError: asString(data.error),
          upstreamMessage: asString(data.message),
        },
        { status: upstreamRes.status }
      );
      appendSetCookieHeaders(relayRes, setCookies);
      return relayRes;
    }

    const relayRes = NextResponse.json(data);
    appendSetCookieHeaders(relayRes, setCookies);
    return relayRes;
  } catch {
    return NextResponse.json({ error: "network_error" }, { status: 503 });
  }
}
