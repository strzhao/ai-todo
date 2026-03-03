import { NextRequest, NextResponse } from "next/server";
import { getUserFromCookie } from "@/lib/auth";

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
export const preferredRegion = "hkg1";

type SessionPayload = {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
};

function normalizeAccessTokenTtl(expiresIn: unknown): number {
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn)) {
    return 60 * 15;
  }
  const rounded = Math.floor(expiresIn);
  if (rounded < 60) return 60;
  if (rounded > 60 * 60) return 60 * 60;
  return rounded;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as SessionPayload;
  const accessToken = body.accessToken ?? "";
  const refreshToken = body.refreshToken ?? "";

  if (!accessToken || !refreshToken) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const user = await getUserFromCookie(accessToken);
  if (!user) {
    return NextResponse.json({ error: "invalid_access_token" }, { status: 401 });
  }

  const accessMaxAge = normalizeAccessTokenTtl(body.expiresIn);
  const res = NextResponse.json({ success: true });

  res.cookies.set({
    name: "access_token",
    value: accessToken,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: accessMaxAge,
  });

  res.cookies.set({
    name: "refresh_token",
    value: refreshToken,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS_SECONDS,
  });

  return res;
}
