import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { createGatewaySessionCookieValue } from "@/lib/auth-gateway-session";

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = req.cookies.get("access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "No access token found" }, { status: 401 });
  }

  const sessionToken = createGatewaySessionCookieValue(user.id, user.email, 7_776_000);

  return NextResponse.json({
    access_token: accessToken,
    session_token: sessionToken,
    user_id: user.id,
    email: user.email,
  });
}
