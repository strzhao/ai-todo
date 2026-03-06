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

  // Set access_token on shared domain so all *.stringzhao.life apps see it
  res.cookies.set({
    name: "access_token",
    value: accessToken,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    domain: ".stringzhao.life",
    maxAge: accessMaxAge,
  });

  // Clear host-only access_token to avoid duplicate-cookie ambiguity
  res.headers.append(
    "set-cookie",
    "access_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
  );

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
