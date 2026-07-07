import { NextRequest, NextResponse } from "next/server";
import { clearGatewaySessionCookie } from "@/lib/auth-gateway-session";

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/auth/logged-out", req.url));
  clearGatewaySessionCookie(res);
  return res;
}
