import { NextResponse } from "next/server";

export const preferredRegion = "hkg1";

export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({ error: "VAPID not configured" }, { status: 500 });
  }
  return NextResponse.json({ publicKey });
}
