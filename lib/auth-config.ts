const DEFAULT_AUTH_ISSUER = "https://user.stringzhao.life";
const DEFAULT_AUTH_SERVICE_ID = "base-account-client";
const DEFAULT_APP_ORIGIN = "https://ai-todo.stringzhao.life";
const DEFAULT_CALLBACK_PATH = "/auth/callback";

export const CALLBACK_PATH =
  process.env.NEXT_PUBLIC_AUTH_CALLBACK_PATH ?? DEFAULT_CALLBACK_PATH;
export const AUTH_ISSUER =
  process.env.AUTH_ISSUER ??
  process.env.NEXT_PUBLIC_AUTH_ISSUER ??
  DEFAULT_AUTH_ISSUER;
export const AUTH_SERVICE_ID =
  process.env.AUTH_SERVICE_ID ??
  process.env.AUTH_AUDIENCE ??
  process.env.NEXT_PUBLIC_AUTH_AUDIENCE ??
  DEFAULT_AUTH_SERVICE_ID;
export const APP_ORIGIN =
  process.env.APP_ORIGIN ??
  process.env.NEXT_PUBLIC_APP_ORIGIN ??
  DEFAULT_APP_ORIGIN;

export function normalizeNextPath(rawPath: string | null | undefined): string {
  if (!rawPath || !rawPath.startsWith("/") || rawPath.startsWith("//")) {
    return "/";
  }
  return rawPath;
}

export function buildCallbackUrl(nextPath?: string): string {
  const callbackUrl = new URL(CALLBACK_PATH, APP_ORIGIN);
  if (nextPath && nextPath !== "/") {
    callbackUrl.searchParams.set("next", nextPath);
  }
  return callbackUrl.toString();
}

export function buildAuthorizeUrl(returnTo: string, state: string): string {
  const authorizeUrl = new URL("/authorize", AUTH_ISSUER);
  authorizeUrl.searchParams.set("service", AUTH_SERVICE_ID);
  authorizeUrl.searchParams.set("return_to", returnTo);
  authorizeUrl.searchParams.set("state", state);
  return authorizeUrl.toString();
}

