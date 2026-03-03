import { NextRequest, NextResponse } from "next/server";

const AUTH_BASE = "https://user.stringzhao.life";
const ALLOWED_ACTIONS = new Set(["send-code", "verify-code", "logout"]);

// POST /api/auth/send-code  { email }
// POST /api/auth/verify-code { email, code }
// POST /api/auth/logout
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params;
  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const cookie = req.headers.get("cookie");
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (cookie) {
    headers.cookie = cookie;
  }

  const upstream = await fetch(`${AUTH_BASE}/api/auth/${action}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = await upstream.json().catch(() => ({
    error: "Auth service response parse failed",
  }));
  const res = NextResponse.json(data, { status: upstream.status });

  const headerBag = upstream.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies = headerBag.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    for (const value of setCookies) {
      res.headers.append("set-cookie", value);
    }
  } else {
    const setCookie = upstream.headers.get("set-cookie");
    if (setCookie) {
      res.headers.set("set-cookie", setCookie);
    }
  }

  return res;
}
