import { createRemoteJWKSet, jwtVerify } from "jose";
import { NextRequest } from "next/server";

interface AuthUser {
  id: string;
  email: string;
}

// 本地开发 bypass：设置 AUTH_DEV_BYPASS=true 跳过认证，使用固定开发用户。
// 生产环境永远不应设置此变量。
const DEV_BYPASS =
  process.env.AUTH_DEV_BYPASS === "true" &&
  process.env.NODE_ENV !== "production";

const DEV_USER: AuthUser = {
  id: process.env.AUTH_DEV_USER_ID ?? "dev-user-local",
  email: process.env.AUTH_DEV_EMAIL ?? "dev@localhost",
};

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
  if (DEV_BYPASS) return DEV_USER;

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
  if (DEV_BYPASS) return DEV_USER;
  try {
    return await verifyToken(cookieValue);
  } catch {
    return null;
  }
}
