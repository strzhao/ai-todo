import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

export const preferredRegion = "hkg1";

const AUTH_ISSUER = process.env.AUTH_ISSUER!;
const SERVICE_KEY = process.env.INVITATION_SERVICE_KEY ?? "svc-ai-todo";

async function fetchCodes(cookie: string) {
  const res = await fetch(
    `${AUTH_ISSUER}/api/auth/invitation-codes?serviceKey=${SERVICE_KEY}`,
    { headers: { cookie }, cache: "no-store" }
  );
  if (!res.ok) return null;
  return res.json() as Promise<{ codes: unknown[]; quota: { used: number; total: number } }>;
}

async function generateCode(cookie: string) {
  await fetch(`${AUTH_ISSUER}/api/auth/invitation-codes/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ serviceKey: SERVICE_KEY }),
  });
}

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cookie = req.headers.get("cookie") ?? "";

  let data = await fetchCodes(cookie);
  if (!data) {
    return NextResponse.json({ codes: [], quota: { used: 0, total: 3 } });
  }

  // Auto-fill: generate remaining codes if quota not fully used
  const missing = data.quota.total - data.codes.length;
  if (missing > 0) {
    for (let i = 0; i < missing; i++) {
      await generateCode(cookie);
    }
    data = await fetchCodes(cookie) ?? data;
  }

  return NextResponse.json(data);
}
