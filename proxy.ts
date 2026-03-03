import { NextRequest, NextResponse } from "next/server";
import { getUserFromCookie } from "@/lib/auth";

const protectedPaths = ["/", "/all"];
const loginPath = "/login";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = protectedPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get("access_token")?.value;

  if (!token) {
    return NextResponse.redirect(new URL(loginPath, req.url));
  }

  const user = await getUserFromCookie(token);
  if (!user) {
    return NextResponse.redirect(new URL(loginPath, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|login|favicon.ico|.*\\..*).*)"],
};
