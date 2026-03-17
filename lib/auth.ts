import { createRemoteJWKSet, jwtVerify } from "jose";
import { NextRequest } from "next/server";
import { readGatewaySessionFromRequest, verifyGatewaySessionCookieValue } from "@/lib/auth-gateway-session";

interface AuthUser {
  id: string;
  email: string;
}

const DEV_BYPASS =
  process.env.AUTH_DEV_BYPASS === "true" &&
  process.env.NODE_ENV !== "production";

const DEV_USER: AuthUser = {
  id: process.env.AUTH_DEV_USER_ID ?? "dev-user-local",
  email: process.env.AUTH_DEV_EMAIL ?? "dev@localhost",
};

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS() {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(new URL(process.env.AUTH_JWKS_URL!));
  }
  return _jwks;
}

async function verifyToken(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, getJWKS(), {
    issuer: process.env.AUTH_ISSUER,
    audience: process.env.AUTH_AUDIENCE,
  });
  return {
    id: payload.sub!,
    email: payload.email as string,
  };
}

export async function getUserFromRequest(req: NextRequest): Promise<AuthUser | null> {
  if (DEV_BYPASS) return DEV_USER;

  // Path 1: Bearer token (CLI / API clients)
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      return await verifyToken(token);
    } catch {
      // JWT failed — try session token (CLI long-lived token)
      const session = verifyGatewaySessionCookieValue(token);
      if (session) {
        return { id: session.userId, email: session.email };
      }
      return null;
    }
  }

  // Path 2: Gateway session cookie (browser)
  const session = readGatewaySessionFromRequest(req);
  if (session) {
    return { id: session.userId, email: session.email };
  }

  return null;
}

export async function getUserFromCookie(cookieValue: string): Promise<AuthUser | null> {
  if (DEV_BYPASS) return DEV_USER;
  try {
    return await verifyToken(cookieValue);
  } catch {
    return null;
  }
}
