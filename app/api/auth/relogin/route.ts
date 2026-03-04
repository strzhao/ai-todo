import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_NEXT_COOKIE,
  AUTH_STATE_COOKIE,
  CALLBACK_PATH,
  buildCallbackUrl,
  buildLoginUrl,
  normalizeNextPath,
} from "@/lib/auth-config";

export const preferredRegion = "hkg1";

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

export async function GET(req: NextRequest) {
  const nextPath = normalizeNextPath(req.nextUrl.searchParams.get("next"));
  const state = crypto.randomUUID();
  const returnTo = buildCallbackUrl();
  const loginUrl = buildLoginUrl(returnTo, state);
  const res = NextResponse.redirect(loginUrl);
  setAuthFlowCookies(res, state, nextPath);
  return res;
}
