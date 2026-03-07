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
  return res;
}
