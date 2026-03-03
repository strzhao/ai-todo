import { createRemoteJWKSet, jwtVerify } from "jose";
import { NextRequest } from "next/server";

interface AuthUser {
  id: string;
  email: string;
}

const JWKS = createRemoteJWKSet(new URL(process.env.AUTH_JWKS_URL!));

async function verifyToken(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: process.env.AUTH_ISSUER,
    audience: process.env.AUTH_AUDIENCE,
  });
  return {
    id: payload.sub!,
    email: payload.email as string,
  };
}

export async function getUserFromRequest(req: NextRequest): Promise<AuthUser | null> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : req.cookies.get("access_token")?.value;

  if (!token) return null;

  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function getUserFromCookie(cookieValue: string): Promise<AuthUser | null> {
  try {
    return await verifyToken(cookieValue);
  } catch {
    return null;
  }
}
