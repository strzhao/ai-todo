import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, isUserActivated, activateUser } from "@/lib/db";

export const preferredRegion = "hkg1";

const AUTH_ISSUER = process.env.AUTH_ISSUER!;
const BASE_ACCOUNT_API_KEY = process.env.BASE_ACCOUNT_API_KEY ?? "";

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();

  if (await isUserActivated(user.id)) {
    return NextResponse.json({ success: true, already: true });
  }

  const { code } = await req.json();
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  // Service proxy mode: use API key to authenticate with base-account,
  // passing the end user's ID so we don't depend on the browser having
  // base-account cookies.
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const body: Record<string, string> = { code: code.trim() };

  if (BASE_ACCOUNT_API_KEY) {
    headers["Authorization"] = `Bearer ${BASE_ACCOUNT_API_KEY}`;
    body.userId = user.id;
  } else {
    // Fallback: forward browser cookies (legacy, requires base-account session)
    const cookie = req.headers.get("cookie") ?? "";
    if (cookie) headers["cookie"] = cookie;
  }

  const res = await fetch(`${AUTH_ISSUER}/api/auth/invitation-codes/redeem`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: data.error ?? "redeem_failed" },
      { status: res.status }
    );
  }

  const data = await res.json();
  await activateUser(user.id, user.email, data.creatorId, code.trim());

  return NextResponse.json({ success: true });
}
