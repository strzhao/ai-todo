import { NextResponse } from "next/server";
import { getUserFromCookie } from "@/lib/auth";
import {
  applyGatewaySessionCookie,
  clearAuthStateCookie,
  createGatewaySessionCookieValue,
  readAuthStateCookie,
  verifyAuthStateCookieValue,
} from "@/lib/auth-gateway-session";

export const runtime = "nodejs";

interface FinalizeBody {
  state?: string;
}

async function parseBody(request: Request): Promise<FinalizeBody> {
  try {
    const payload = (await request.json()) as FinalizeBody;
    if (!payload || typeof payload !== "object") return {};
    return payload;
  } catch {
    return {};
  }
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

function readCookie(request: Request, name: string): string {
  const raw = String(request.headers.get("cookie") || "").trim();
  if (!raw) return "";

  for (const chunk of raw.split(";")) {
    const [cookieName, ...valueParts] = chunk.split("=");
    if (String(cookieName || "").trim() !== name) continue;

    const value = valueParts.join("=").trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return "";
}

export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request);
  const state = String(body.state || "").trim();
  if (!state) {
    return noStore(NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 }));
  }

  const authStateCookie = readAuthStateCookie(request);
  const authState = verifyAuthStateCookieValue(authStateCookie, state);
  if (!authState) {
    const response = NextResponse.json({ ok: false, error: "invalid_state" }, { status: 400 });
    clearAuthStateCookie(response);
    return noStore(response);
  }

  const accessToken = readCookie(request, "access_token");
  if (!accessToken) {
    return noStore(
      NextResponse.json(
        { ok: false, error: "missing_access_token", message: "missing_access_token_cookie" },
        { status: 401 },
      ),
    );
  }

  const user = await getUserFromCookie(accessToken);
  if (!user) {
    return noStore(
      NextResponse.json({ ok: false, error: "invalid_access_token" }, { status: 401 }),
    );
  }

  const response = NextResponse.json(
    {
      ok: true,
      next: authState.next,
      user: { id: user.id, email: user.email },
    },
    { status: 200 },
  );
  clearAuthStateCookie(response);
  applyGatewaySessionCookie(response, createGatewaySessionCookieValue(user.id, user.email));
  return noStore(response);
}
