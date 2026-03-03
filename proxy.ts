import { NextRequest, NextResponse } from "next/server";
import { getUserFromCookie } from "@/lib/auth";

const protectedPaths = ["/", "/all"];
const protectedApiPaths = ["/api/tasks", "/api/parse-task"];
const loginPath = "/login";

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

function getAccessTokenFromSetCookie(values: string[]): string | null {
  for (const value of values) {
    const firstPart = value.split(";")[0];
    if (!firstPart.startsWith("access_token=")) continue;

    const rawToken = firstPart.slice("access_token=".length);
    try {
      return decodeURIComponent(rawToken);
    } catch {
      return rawToken;
    }
  }

  return null;
}

async function tryRefreshSession(req: NextRequest): Promise<{
  accessToken: string | null;
  setCookies: string[];
} | null> {
  if (!req.cookies.get("refresh_token")?.value) return null;

  const headers: HeadersInit = { "Content-Type": "application/json" };
  const cookie = req.headers.get("cookie");
  if (cookie) {
    headers.cookie = cookie;
  }

  const refreshRes = await fetch(new URL("/api/auth/refresh", req.url), {
    method: "POST",
    headers,
    body: "{}",
    cache: "no-store",
  });

  if (!refreshRes.ok) return null;

  const data = await refreshRes.json().catch(() => ({}));
  const setCookies = getSetCookieValues(refreshRes.headers);
  const bodyToken =
    (typeof data.accessToken === "string" && data.accessToken) ||
    (typeof data.access_token === "string" && data.access_token) ||
    null;
  const accessToken = bodyToken ?? getAccessTokenFromSetCookie(setCookies);

  return { accessToken, setCookies };
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === loginPath || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const isProtectedPage = protectedPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  const isProtectedApi = protectedApiPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (!isProtectedPage && !isProtectedApi) return NextResponse.next();

  const token = req.cookies.get("access_token")?.value;
  if (token) {
    const user = await getUserFromCookie(token);
    if (user) {
      return NextResponse.next();
    }
  }

  const refreshResult = await tryRefreshSession(req);
  if (refreshResult) {
    const requestHeaders = new Headers(req.headers);
    if (refreshResult.accessToken) {
      requestHeaders.set("authorization", `Bearer ${refreshResult.accessToken}`);
    }

    const res = NextResponse.next({ request: { headers: requestHeaders } });
    appendSetCookieHeaders(res, refreshResult.setCookies);
    return res;
  }

  if (isProtectedApi) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isProtectedPage) {
    return NextResponse.redirect(new URL(loginPath, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\..*).*)"],
};
