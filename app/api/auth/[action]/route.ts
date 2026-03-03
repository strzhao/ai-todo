import { NextRequest, NextResponse } from "next/server";

const AUTH_BASE = "https://user.stringzhao.life";

// POST /api/auth/send-code  { email }
// POST /api/auth/verify-code { email, code }
// POST /api/auth/logout
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params;
  const body = await req.json();

  const upstream = await fetch(`${AUTH_BASE}/api/auth/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });

  const data = await upstream.json();

  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }

  // On verify-code, set access_token cookie on our domain
  const res = NextResponse.json(data);

  // Auth server returns accessToken (camelCase)
  const token = data.accessToken ?? data.access_token;
  if (action === "verify-code" && token) {
    res.cookies.set("access_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });
  }

  if (action === "logout") {
    res.cookies.delete("access_token");
  }

  return res;
}
