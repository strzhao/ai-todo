import { NextRequest, NextResponse } from "next/server";
import {
  clearGatewaySessionCookie,
  applyAuthStateCookie,
  createAuthStateCookieValue,
} from "@/lib/auth-gateway-session";
import { buildAuthorizeUrl, buildCallbackUrl } from "@/lib/auth-config";

export async function GET(req: NextRequest) {
  const state = crypto.randomUUID();
  const returnTo = buildCallbackUrl();
  const authorizeUrl = buildAuthorizeUrl(returnTo, state, "select_account");

  const res = NextResponse.redirect(new URL(authorizeUrl), { status: 302 });
  clearGatewaySessionCookie(res);
  applyAuthStateCookie(res, createAuthStateCookieValue(state, "/"));

  // Clear any stale host-only access_token cookie on ai-todo domain
  // to prevent it from shadowing the new .stringzhao.life domain cookie
  res.cookies.set("access_token", "", { path: "/", maxAge: 0 });
  res.cookies.set("refresh_token", "", { path: "/", maxAge: 0 });

  return res;
}
