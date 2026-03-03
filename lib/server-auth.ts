import { cookies } from "next/headers";
import { getUserFromCookie } from "./auth";

export interface AuthUser {
  id: string;
  email: string;
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
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;
  return getUserFromCookie(token);
}
