import { NextRequest, NextResponse } from "next/server";
import { AUTH_ISSUER } from "@/lib/auth-config";

export const preferredRegion = "hkg1";

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
    const res = await fetch(new URL("/api/auth/refresh", AUTH_ISSUER), {
      method: "POST",
      headers,
      body: "{}",
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: "refresh_failed" }, { status: res.status });
    }

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "network_error" }, { status: 503 });
  }
}
