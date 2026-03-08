import { cookies } from "next/headers";
import {
  GATEWAY_SESSION_COOKIE_NAME,
  verifyGatewaySessionCookieValue,
} from "@/lib/auth-gateway-session";

export interface AuthUser {
  id: string;
  email: string;
  nickname?: string;
}

const DEV_BYPASS =
  process.env.AUTH_DEV_BYPASS === "true" &&
  process.env.NODE_ENV !== "production";

export async function getServerUser(): Promise<AuthUser | null> {
  if (DEV_BYPASS) {
    return {
      id: process.env.AUTH_DEV_USER_ID ?? "dev-user-local",
      email: process.env.AUTH_DEV_EMAIL ?? "dev@localhost",
    };
  }
  const cookieStore = await cookies();
  const raw = cookieStore.get(GATEWAY_SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;

  const session = verifyGatewaySessionCookieValue(raw);
  if (!session) return null;

  return { id: session.userId, email: session.email };
}
