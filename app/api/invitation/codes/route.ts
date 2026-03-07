import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

export const preferredRegion = "hkg1";

const AUTH_ISSUER = process.env.AUTH_ISSUER!;
const SERVICE_KEY = process.env.INVITATION_SERVICE_KEY ?? "svc-ai-todo";

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cookie = req.headers.get("cookie") ?? "";
  const res = await fetch(
    `${AUTH_ISSUER}/api/auth/invitation-codes?serviceKey=${SERVICE_KEY}`,
    { headers: { cookie }, cache: "no-store" }
  );

  if (!res.ok) {
    return NextResponse.json({ codes: [], quota: { used: 0, total: 3 } });
  }

  return NextResponse.json(await res.json());
}
