import { NextRequest, NextResponse } from "next/server";
import { getUserFromCookie } from "@/lib/auth";
import { normalizeAccessTokenTtl } from "@/lib/auth-cookie";

export const preferredRegion = "hkg1";

type SessionPayload = {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as SessionPayload;
  const accessToken = body.accessToken ?? "";

  if (!accessToken) {
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
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return res;
}
