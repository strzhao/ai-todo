import { NextRequest, NextResponse } from "next/server";
import { getUserFromCookie } from "@/lib/auth";
import {
  AUTH_ISSUER,
  CALLBACK_PATH,
  buildAuthorizeUrl,
  buildCallbackUrl,
  normalizeNextPath,
} from "@/lib/auth-config";
import {
  AUTH_STATE_COOKIE_NAME,
  applyAuthStateCookie,
  clearAuthStateCookie,
  createAuthStateCookieValue,
  readAuthStateCookie,
  readGatewaySessionFromRequest,
  verifyAuthStateCookieValue,
} from "@/lib/auth-gateway-session";

const protectedPaths = ["/", "/all", "/spaces", "/join", "/auth/cli", "/activate"];
const protectedApiPaths = ["/api/tasks", "/api/parse-task", "/api/spaces"];

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

  if (
    process.env.AUTH_DEV_BYPASS === "true" &&
    process.env.NODE_ENV !== "production"
  ) {
    return NextResponse.next();
  }

  // Callback route: validate state from signed cookie
  if (pathname === CALLBACK_PATH) {
    const hasError = Boolean(req.nextUrl.searchParams.get("error"));
    if (hasError) {
      return NextResponse.next();
    }

    const returnedState = req.nextUrl.searchParams.get("state");
    const authorized = req.nextUrl.searchParams.get("authorized");

    if (authorized === "1" && returnedState) {
      const authStateCookie = readAuthStateCookie(req);
      const authState = verifyAuthStateCookieValue(authStateCookie, returnedState);
      if (authState) {
        return NextResponse.next();
      }
    }

    const code =
      authorized === "1" ? "state_mismatch" : "authorization_not_completed";
    const errorUrl = new URL(CALLBACK_PATH, req.url);
    errorUrl.searchParams.set("error", code);
    const res = NextResponse.redirect(errorUrl);
    clearAuthStateCookie(res);
    return res;
  }

  const isProtectedPage = protectedPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  const isProtectedApi = protectedApiPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (!isProtectedPage && !isProtectedApi) return NextResponse.next();

  // Path 1: Bearer token (CLI / API clients) — JWT verification
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const user = await getUserFromCookie(token);
    if (user) {
      return NextResponse.next();
    }
  }

  // Path 2: Gateway session cookie (browser)
  const session = readGatewaySessionFromRequest(req);
  if (session) {
    return NextResponse.next();
  }

  // No valid auth — return 401 for API and RSC prefetch requests
  if (isProtectedApi || (isProtectedPage && isRscPrefetchRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Redirect to authorize for page requests
  if (isProtectedPage) {
    const state = crypto.randomUUID();
    const nextPath = normalizeNextPath(`${pathname}${req.nextUrl.search}`);
    const returnTo = buildCallbackUrl(nextPath);
    const authorizeUrl = buildAuthorizeUrl(returnTo, state);

    console.warn("[auth] redirect_to_login", { path: pathname, state });

    const res = NextResponse.redirect(authorizeUrl);
    applyAuthStateCookie(res, createAuthStateCookieValue(state, nextPath));
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\..*).*)"],
};
