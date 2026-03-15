import crypto from "node:crypto";
import { NextResponse } from "next/server";

export const AUTH_STATE_COOKIE_NAME = "ai_todo_auth_state";
export const GATEWAY_SESSION_COOKIE_NAME = "ai_todo_gateway_session";

interface AuthStatePayload {
  state: string;
  next: string;
  issuedAt: number;
  expiresAt: number;
}

export interface GatewaySessionPayload {
  userId: string;
  email: string;
  issuedAt: number;
  expiresAt: number;
}

function base64urlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function secret(): string {
  const value =
    String(process.env.AUTH_GATEWAY_SESSION_SECRET || "").trim() ||
    String(process.env.CRON_SECRET || "").trim();
  return value || "dev-auth-gateway-secret";
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encodeSignedPayload(input: Record<string, unknown>): string {
  const payload = JSON.stringify(input);
  const encoded = base64urlEncode(payload);
  return `${encoded}.${sign(encoded)}`;
}

function decodeSignedPayload(input: string): Record<string, unknown> | null {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const [encoded, providedSig] = raw.split(".", 2);
  if (!encoded || !providedSig) return null;

  const expectedSig = sign(encoded);
  try {
    const valid = crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(providedSig));
    if (!valid) return null;
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(base64urlDecode(encoded)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseCookie(request: Request, name: string): string {
  const raw = String(request.headers.get("cookie") || "").trim();
  if (!raw) return "";

  for (const chunk of raw.split(";")) {
    const [cookieName, ...valueParts] = chunk.split("=");
    if (String(cookieName || "").trim() !== name) continue;

    const value = valueParts.join("=").trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return "";
}

export function createAuthStateCookieValue(state: string, nextPath: string, ttlSeconds = 600): string {
  const now = Date.now();
  return encodeSignedPayload({
    state,
    next: nextPath,
    issuedAt: now,
    expiresAt: now + ttlSeconds * 1000,
  });
}

export function verifyAuthStateCookieValue(raw: string, expectedState: string): AuthStatePayload | null {
  const decoded = decodeSignedPayload(raw);
  if (!decoded) return null;

  const state = String(decoded.state || "").trim();
  const next = String(decoded.next || "/");
  const issuedAt = Number(decoded.issuedAt || 0);
  const expiresAt = Number(decoded.expiresAt || 0);

  if (!state || state !== String(expectedState || "").trim()) return null;
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return null;
  if (Date.now() > expiresAt) return null;

  return { state, next, issuedAt, expiresAt };
}

export function createGatewaySessionCookieValue(userId: string, email: string, ttlSeconds = 2_592_000): string {
  const now = Date.now();
  return encodeSignedPayload({
    userId: String(userId || "").trim(),
    email: String(email || "").trim().toLowerCase(),
    issuedAt: now,
    expiresAt: now + ttlSeconds * 1000,
  });
}

export function verifyGatewaySessionCookieValue(raw: string): GatewaySessionPayload | null {
  const decoded = decodeSignedPayload(raw);
  if (!decoded) return null;

  const userId = String(decoded.userId || "").trim();
  const email = String(decoded.email || "").trim().toLowerCase();
  const issuedAt = Number(decoded.issuedAt || 0);
  const expiresAt = Number(decoded.expiresAt || 0);

  if (!userId || !email || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return null;
  if (Date.now() > expiresAt) return null;

  return { userId, email, issuedAt, expiresAt };
}

export function readAuthStateCookie(request: Request): string {
  return parseCookie(request, AUTH_STATE_COOKIE_NAME);
}

export function readGatewaySessionCookie(request: Request): string {
  return parseCookie(request, GATEWAY_SESSION_COOKIE_NAME);
}

export function applyAuthStateCookie(response: NextResponse, value: string): void {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set({
    name: AUTH_STATE_COOKIE_NAME,
    value,
    path: "/",
    secure,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
  });
}

export function clearAuthStateCookie(response: NextResponse): void {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set({
    name: AUTH_STATE_COOKIE_NAME,
    value: "",
    path: "/",
    secure,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
  });
}

export function applyGatewaySessionCookie(response: NextResponse, value: string): void {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set({
    name: GATEWAY_SESSION_COOKIE_NAME,
    value,
    path: "/",
    secure,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 2_592_000,
  });
}

export function clearGatewaySessionCookie(response: NextResponse): void {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set({
    name: GATEWAY_SESSION_COOKIE_NAME,
    value: "",
    path: "/",
    secure,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
  });
}

export function readGatewaySessionFromRequest(request: Request): GatewaySessionPayload | null {
  const raw = readGatewaySessionCookie(request);
  if (!raw) return null;
  return verifyGatewaySessionCookieValue(raw);
}
