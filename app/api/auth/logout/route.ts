import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_ISSUER } from "@/lib/auth-config";

function getSetCookieValues(headers: Headers): string[] {
  const headerBag = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = headerBag.getSetCookie?.() ?? [];
  if (setCookies.length > 0) return setCookies;
  const fallback = headers.get("set-cookie");
  return fallback ? [fallback] : [];
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("refresh_token")?.value;

  // Call auth server logout and collect its Set-Cookie headers.
  // Auth server clears the browser's .stringzhao.life session cookies via these headers —
  // we must forward them to the browser, otherwise the SSO session persists and auto-relogins.
  let upstreamSetCookies: string[] = [];
  if (refreshToken) {
    const authRes = await fetch(new URL("/api/auth/logout", AUTH_ISSUER), {
      method: "POST",
      headers: { cookie: `refresh_token=${refreshToken}` },
      cache: "no-store",
    }).catch(() => null);
    if (authRes) {
      upstreamSetCookies = getSetCookieValues(authRes.headers);
    }
  }

  // Clear our domain's cookies
  cookieStore.delete("access_token");
  cookieStore.delete("refresh_token");

  // Redirect to logged-out page, forwarding auth server's Set-Cookie so browser
  // clears the .stringzhao.life session cookie too
  const res = NextResponse.redirect(new URL("/auth/logged-out", req.url));
  for (const value of upstreamSetCookies) {
    res.headers.append("set-cookie", value);
  }
  return res;
}

