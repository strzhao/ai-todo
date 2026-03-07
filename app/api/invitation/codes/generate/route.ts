import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

export const preferredRegion = "hkg1";

const AUTH_ISSUER = process.env.AUTH_ISSUER!;
const SERVICE_KEY = process.env.INVITATION_SERVICE_KEY ?? "svc-ai-todo";

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cookie = req.headers.get("cookie") ?? "";
  const res = await fetch(`${AUTH_ISSUER}/api/auth/invitation-codes/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ serviceKey: SERVICE_KEY }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: data.error ?? "generate_failed" },
      { status: res.status }
    );
  }

  return NextResponse.json(await res.json());
}
