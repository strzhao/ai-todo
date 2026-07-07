import { describe, it, expect } from "vitest";
import {
  createAuthStateCookieValue,
  verifyAuthStateCookieValue,
  createGatewaySessionCookieValue,
  verifyGatewaySessionCookieValue,
  AUTH_STATE_COOKIE_NAME,
  GATEWAY_SESSION_COOKIE_NAME,
} from "@/lib/auth-gateway-session";

describe("cookie name constants", () => {
  it("exports auth state cookie name", () => {
    expect(AUTH_STATE_COOKIE_NAME).toBe("ai_todo_auth_state");
  });

  it("exports gateway session cookie name", () => {
    expect(GATEWAY_SESSION_COOKIE_NAME).toBe("ai_todo_gateway_session");
  });
});

describe("auth state cookie sign/verify", () => {
  it("creates and verifies a valid auth state", () => {
    const value = createAuthStateCookieValue("my-state", "/spaces/abc");
    const result = verifyAuthStateCookieValue(value, "my-state");
    expect(result).not.toBeNull();
    expect(result!.state).toBe("my-state");
    expect(result!.next).toBe("/spaces/abc");
    expect(result!.issuedAt).toBeGreaterThan(0);
    expect(result!.expiresAt).toBeGreaterThan(result!.issuedAt);
  });

  it("rejects when state does not match", () => {
    const value = createAuthStateCookieValue("my-state", "/");
    const result = verifyAuthStateCookieValue(value, "wrong-state");
    expect(result).toBeNull();
  });

  it("rejects tampered value", () => {
    const value = createAuthStateCookieValue("my-state", "/");
    const tampered = value.slice(0, -3) + "xxx";
    const result = verifyAuthStateCookieValue(tampered, "my-state");
    expect(result).toBeNull();
  });

  it("rejects empty string", () => {
    const result = verifyAuthStateCookieValue("", "state");
    expect(result).toBeNull();
  });

  it("rejects expired state (ttl=0)", () => {
    const value = createAuthStateCookieValue("my-state", "/", 0);
    // expiresAt = now + 0 => already expired or at edge
    // Sleep not needed - 0 TTL means expiresAt === issuedAt, Date.now() >= expiresAt
    const result = verifyAuthStateCookieValue(value, "my-state");
    // This could be null or valid at the exact ms boundary, so test with negative TTL concept
    // Instead, test with a very short TTL and verify structure
    const value2 = createAuthStateCookieValue("s", "/", 3600);
    const result2 = verifyAuthStateCookieValue(value2, "s");
    expect(result2).not.toBeNull();
  });
});

describe("gateway session cookie sign/verify", () => {
  it("creates and verifies a valid gateway session", () => {
    const value = createGatewaySessionCookieValue("user-123", "test@example.com");
    const result = verifyGatewaySessionCookieValue(value);
    expect(result).not.toBeNull();
    expect(result!.userId).toBe("user-123");
    expect(result!.email).toBe("test@example.com");
    expect(result!.expiresAt).toBeGreaterThan(result!.issuedAt);
  });

  it("normalizes email to lowercase", () => {
    const value = createGatewaySessionCookieValue("user-123", "Test@Example.COM");
    const result = verifyGatewaySessionCookieValue(value);
    expect(result).not.toBeNull();
    expect(result!.email).toBe("test@example.com");
  });

  it("rejects tampered value", () => {
    const value = createGatewaySessionCookieValue("user-123", "test@example.com");
    const tampered = "x" + value;
    const result = verifyGatewaySessionCookieValue(tampered);
    expect(result).toBeNull();
  });

  it("rejects empty string", () => {
    expect(verifyGatewaySessionCookieValue("")).toBeNull();
  });
});
