import { NextRequest, NextResponse } from "next/server";
import { getUserFromCookie } from "@/lib/auth";
import { normalizeAccessTokenTtl } from "@/lib/auth-cookie";
import {
  AUTH_NEXT_COOKIE,
  AUTH_ISSUER,
  AUTH_STATE_COOKIE,
  CALLBACK_PATH,
  buildAuthorizeUrl,
  buildCallbackUrl,
  normalizeNextPath,
} from "@/lib/auth-config";

const protectedPaths = ["/", "/all", "/readme", "/spaces", "/join"];
const protectedApiPaths = ["/api/tasks", "/api/parse-task", "/api/spaces"];

type RefreshAttemptResult =
  | {
      ok: true;
      status: number;
      accessToken: string | null;
      setCookies: string[];
    }
  | {
      ok: false;
      status: number | null;
    };

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

function setAuthFlowCookies(res: NextResponse, state: string, nextPath: string) {
  res.cookies.set({
    name: AUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: CALLBACK_PATH,
    maxAge: 60 * 5,
  });

  res.cookies.set({
    name: AUTH_NEXT_COOKIE,
    value: encodeURIComponent(normalizeNextPath(nextPath)),
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: CALLBACK_PATH,
    maxAge: 60 * 5,
  });
}

function clearAuthStateCookie(res: NextResponse) {
  res.cookies.set({
    name: AUTH_STATE_COOKIE,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: CALLBACK_PATH,
    maxAge: 0,
  });
}

function clearAuthFlowCookies(res: NextResponse) {
  clearAuthStateCookie(res);
  res.cookies.set({
    name: AUTH_NEXT_COOKIE,
    value: "",
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: CALLBACK_PATH,
    maxAge: 0,
  });
}

function clearLocalRefreshCookie(res: NextResponse) {
  // We no longer persist a host-only refresh_token in this app.
  // Clearing it prevents collisions with the shared-domain refresh cookie.
  res.cookies.set({
    name: "refresh_token",
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

function hasRefreshTokenCookie(cookieHeader: string): boolean {
  return /(?:^|;\s*)refresh_token=/.test(cookieHeader);
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

async function tryRefreshSession(cookie: string): Promise<RefreshAttemptResult> {
  const headers: HeadersInit = { "Content-Type": "application/json", cookie };

  try {
    const refreshRes = await fetch(new URL("/api/auth/refresh", AUTH_ISSUER), {
      method: "POST",
      headers,
      body: "{}",
      cache: "no-store",
    });

    if (!refreshRes.ok) {
      return { ok: false, status: refreshRes.status };
    }

    const data = await refreshRes.json().catch(() => ({}));
    const setCookies = getSetCookieValues(refreshRes.headers);
    const bodyToken =
      (typeof data.accessToken === "string" && data.accessToken) ||
      (typeof data.access_token === "string" && data.access_token) ||
      null;
    const accessToken = bodyToken ?? getAccessTokenFromSetCookie(setCookies);

    return { ok: true, status: refreshRes.status, accessToken, setCookies };
  } catch {
    return { ok: false, status: null };
  }
}

function buildCallbackErrorUrl(req: NextRequest, code: string): URL {
  const callbackUrl = new URL(CALLBACK_PATH, req.url);
  callbackUrl.searchParams.set("error", code);
  return callbackUrl;
}

function isRscPrefetchRequest(req: NextRequest): boolean {
  if (req.nextUrl.searchParams.has("_rsc")) return true;
  if (req.headers.has("rsc")) return true;
  if (req.headers.get("next-router-prefetch") === "1") return true;

  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/x-component")) return true;

  const purpose = (req.headers.get("purpose") ?? req.headers.get("sec-purpose") ?? "").toLowerCase();
  return purpose.includes("prefetch");
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 本地开发 bypass：AUTH_DEV_BYPASS=true 时跳过所有认证检查。
  if (
    process.env.AUTH_DEV_BYPASS === "true" &&
    process.env.NODE_ENV !== "production"
  ) {
    return NextResponse.next();
  }

  if (pathname === CALLBACK_PATH) {
    const hasError = Boolean(req.nextUrl.searchParams.get("error"));
    if (hasError) {
      return NextResponse.next();
    }

    const returnedState = req.nextUrl.searchParams.get("state");
    const authorized = req.nextUrl.searchParams.get("authorized");
    const expectedState = req.cookies.get(AUTH_STATE_COOKIE)?.value;

    if (
      authorized === "1" &&
      returnedState &&
      expectedState &&
      returnedState === expectedState
    ) {
      const res = NextResponse.next();
      clearAuthStateCookie(res);
      return res;
    }

    const code =
      authorized === "1" ? "state_mismatch" : "authorization_not_completed";
    const res = NextResponse.redirect(buildCallbackErrorUrl(req, code));
    clearAuthFlowCookies(res);
    return res;
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

  const rawCookie = req.headers.get("cookie") ?? "";
  const shouldAttemptRefresh = hasRefreshTokenCookie(rawCookie);
  if (shouldAttemptRefresh) {
    console.info("[auth] refresh_attempt", { path: pathname });
  }
  const refreshResult = shouldAttemptRefresh ? await tryRefreshSession(rawCookie) : null;
  if (refreshResult?.ok) {
    console.info("[auth] refresh_success", { path: pathname, status: refreshResult.status });
    const requestHeaders = new Headers(req.headers);
    if (refreshResult.accessToken) {
      requestHeaders.set("authorization", `Bearer ${refreshResult.accessToken}`);
    }

    const res = NextResponse.next({ request: { headers: requestHeaders } });
    appendSetCookieHeaders(res, refreshResult.setCookies);

    // Override access_token cookie with extended TTL
    if (refreshResult.accessToken) {
      res.cookies.set("access_token", refreshResult.accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        domain: ".stringzhao.life",
        maxAge: normalizeAccessTokenTtl(null),
      });
    }

    clearLocalRefreshCookie(res);
    return res;
  }
  if (refreshResult && !refreshResult.ok) {
    console.warn("[auth] refresh_failed", { path: pathname, status: refreshResult.status });
  }

  if (isProtectedApi) {
    const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (shouldAttemptRefresh) {
      clearLocalRefreshCookie(res);
    }
    return res;
  }

  if (isProtectedPage) {
    // Client-side RSC/prefetch requests must not be redirected to the external
    // auth server, otherwise the fetch follows cross-origin redirect and hits CORS.
    // Return 401 so the client aborts these background requests silently.
    if (isRscPrefetchRequest(req)) {
      const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (shouldAttemptRefresh) {
        clearLocalRefreshCookie(res);
      }
      return res;
    }

    const state = crypto.randomUUID();
    const nextPath = normalizeNextPath(`${pathname}${req.nextUrl.search}`);
    const returnTo = buildCallbackUrl();
    const authorizeUrl = buildAuthorizeUrl(returnTo, state);

    const res = NextResponse.redirect(authorizeUrl);
    if (shouldAttemptRefresh) {
      clearLocalRefreshCookie(res);
    }
    setAuthFlowCookies(res, state, nextPath);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\..*).*)"],
};
