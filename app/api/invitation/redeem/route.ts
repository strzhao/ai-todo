import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, isUserActivated, activateUser } from "@/lib/db";

export const preferredRegion = "hkg1";

const AUTH_ISSUER = process.env.AUTH_ISSUER!;

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

  const cookie = req.headers.get("cookie") ?? "";
  const res = await fetch(`${AUTH_ISSUER}/api/auth/invitation-codes/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ code: code.trim() }),
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
