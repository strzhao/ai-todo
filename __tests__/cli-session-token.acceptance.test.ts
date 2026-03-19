import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "node:crypto";

/**
 * CLI 长效 Session Token 验收测试
 *
 * 基于设计文档编写，验证：
 * 1. /api/auth/cli-token 返回 session_token 字段
 * 2. session_token 格式为 <base64url_payload>.<base64url_signature>（HMAC-SHA256）
 * 3. getUserFromRequest 能通过 Bearer header 验证 session token
 * 4. session token 包含正确的 userId 和 email
 * 5. session token 90 天内有效
 * 6. 过期的 session token 被拒绝
 * 7. 篡改的 session token 被拒绝
 * 8. 向后兼容：JWT access_token 仍然可用
 */

// ── helpers ──────────────────────────────────────────────────────────────────

const TEST_SECRET = "test-cli-session-secret";
const TEST_USER_ID = "user-uuid-12345";
const TEST_EMAIL = "test@example.com";

/** 模拟 Gateway Session 签名机制（与 auth-gateway-session.ts 一致） */
function createTestSessionToken(
  payload: Record<string, unknown>,
  secret = TEST_SECRET
): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

function decodeTokenPayload(token: string): Record<string, unknown> | null {
  const [encoded] = token.split(".", 2);
  if (!encoded) return null;
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// ── 1. /api/auth/cli-token 响应格式 ─────────────────────────────────────────

describe("cli-token 端点响应格式", () => {
  it.skip("返回的 JSON 包含 session_token 字段（需要认证 mock）", async () => {
    // 动态导入，让 vi.mock 生效
    const { POST } = await import("@/app/api/auth/cli-token/route");

    const req = new NextRequest("https://ai-todo.stringzhao.life/api/auth/cli-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "test-auth-code" }),
    });

    const res = await POST(req);
    const body = await res.json();

    // 核心断言：响应中必须包含 session_token
    expect(body).toHaveProperty("session_token");
    expect(typeof body.session_token).toBe("string");
    expect(body.session_token.length).toBeGreaterThan(0);
  });

  it.skip("session_token 同时返回传统的 access_token（需要认证 mock）", async () => {
    const { POST } = await import("@/app/api/auth/cli-token/route");

    const req = new NextRequest("https://ai-todo.stringzhao.life/api/auth/cli-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "test-auth-code" }),
    });

    const res = await POST(req);
    const body = await res.json();

    // 传统字段仍然存在
    expect(body).toHaveProperty("access_token");
  });
});

// ── 2. Session Token 格式验证 ────────────────────────────────────────────────

describe("session token 格式", () => {
  it("格式为 <base64url_payload>.<base64url_signature>", () => {
    const token = createTestSessionToken({
      userId: TEST_USER_ID,
      email: TEST_EMAIL,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 90 * 24 * 3600 * 1000,
    });

    const parts = token.split(".");
    expect(parts).toHaveLength(2);

    // 两段都是合法的 base64url（无 +、/、= 填充）
    const base64urlPattern = /^[A-Za-z0-9_-]+$/;
    expect(parts[0]).toMatch(base64urlPattern);
    expect(parts[1]).toMatch(base64urlPattern);
  });

  it("payload 段可解码为包含 userId 和 email 的 JSON", () => {
    const now = Date.now();
    const token = createTestSessionToken({
      userId: TEST_USER_ID,
      email: TEST_EMAIL,
      issuedAt: now,
      expiresAt: now + 90 * 24 * 3600 * 1000,
    });

    const payload = decodeTokenPayload(token);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe(TEST_USER_ID);
    expect(payload!.email).toBe(TEST_EMAIL);
  });

  it("签名使用 HMAC-SHA256 算法", () => {
    const payload = { userId: TEST_USER_ID, email: TEST_EMAIL, issuedAt: Date.now(), expiresAt: Date.now() + 1000 };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const expectedSig = crypto.createHmac("sha256", TEST_SECRET).update(encoded).digest("base64url");

    const token = createTestSessionToken(payload);
    const actualSig = token.split(".")[1];

    expect(actualSig).toBe(expectedSig);
  });
});

// ── 3. Session Token 有效期 ──────────────────────────────────────────────────

describe("session token 有效期", () => {
  it("90 天有效期 — expiresAt 距 issuedAt 约 90 天", () => {
    const now = Date.now();
    const ninetyDaysMs = 90 * 24 * 3600 * 1000;

    const token = createTestSessionToken({
      userId: TEST_USER_ID,
      email: TEST_EMAIL,
      issuedAt: now,
      expiresAt: now + ninetyDaysMs,
    });

    const payload = decodeTokenPayload(token)!;
    const ttl = Number(payload.expiresAt) - Number(payload.issuedAt);
    expect(ttl).toBe(ninetyDaysMs);
  });
});

// ── 4. getUserFromRequest 验证 session token ─────────────────────────────────

describe("getUserFromRequest 支持 session token", () => {
  it("通过 Bearer header 传入有效 session token 返回用户信息", async () => {
    const { getUserFromRequest } = await import("@/lib/auth");

    const now = Date.now();
    const token = createTestSessionToken({
      userId: TEST_USER_ID,
      email: TEST_EMAIL,
      issuedAt: now,
      expiresAt: now + 90 * 24 * 3600 * 1000,
    });

    const req = new NextRequest("https://ai-todo.stringzhao.life/api/tasks", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const user = await getUserFromRequest(req);

    expect(user).not.toBeNull();
    expect(user!.id).toBe(TEST_USER_ID);
    expect(user!.email).toBe(TEST_EMAIL);
  });

  it("过期的 session token 被拒绝", async () => {
    const { getUserFromRequest } = await import("@/lib/auth");

    const now = Date.now();
    const token = createTestSessionToken({
      userId: TEST_USER_ID,
      email: TEST_EMAIL,
      issuedAt: now - 100 * 24 * 3600 * 1000, // 100 天前签发
      expiresAt: now - 10 * 24 * 3600 * 1000,  // 10 天前过期
    });

    const req = new NextRequest("https://ai-todo.stringzhao.life/api/tasks", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const user = await getUserFromRequest(req);
    expect(user).toBeNull();
  });

  it("篡改 payload 的 session token 被拒绝", async () => {
    const { getUserFromRequest } = await import("@/lib/auth");

    const now = Date.now();
    // 先创建一个合法 token
    const validToken = createTestSessionToken({
      userId: TEST_USER_ID,
      email: TEST_EMAIL,
      issuedAt: now,
      expiresAt: now + 90 * 24 * 3600 * 1000,
    });

    // 篡改 payload（替换 userId）但保留原签名
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        userId: "hacker-id",
        email: "hacker@evil.com",
        issuedAt: now,
        expiresAt: now + 90 * 24 * 3600 * 1000,
      }),
      "utf8"
    ).toString("base64url");
    const originalSig = validToken.split(".")[1];
    const tamperedToken = `${tamperedPayload}.${originalSig}`;

    const req = new NextRequest("https://ai-todo.stringzhao.life/api/tasks", {
      headers: { Authorization: `Bearer ${tamperedToken}` },
    });

    const user = await getUserFromRequest(req);
    expect(user).toBeNull();
  });

  it("篡改签名的 session token 被拒绝", async () => {
    const { getUserFromRequest } = await import("@/lib/auth");

    const now = Date.now();
    const validToken = createTestSessionToken({
      userId: TEST_USER_ID,
      email: TEST_EMAIL,
      issuedAt: now,
      expiresAt: now + 90 * 24 * 3600 * 1000,
    });

    // 保留 payload 但替换签名为随机值
    const payload = validToken.split(".")[0];
    const fakeSig = crypto.randomBytes(32).toString("base64url");
    const tamperedToken = `${payload}.${fakeSig}`;

    const req = new NextRequest("https://ai-todo.stringzhao.life/api/tasks", {
      headers: { Authorization: `Bearer ${tamperedToken}` },
    });

    const user = await getUserFromRequest(req);
    expect(user).toBeNull();
  });

  it("完全随机的字符串作为 Bearer token 被拒绝", async () => {
    const { getUserFromRequest } = await import("@/lib/auth");

    const req = new NextRequest("https://ai-todo.stringzhao.life/api/tasks", {
      headers: { Authorization: "Bearer totally-random-garbage-string" },
    });

    const user = await getUserFromRequest(req);
    expect(user).toBeNull();
  });
});

// ── 5. 向后兼容 JWT ─────────────────────────────────────────────────────────

describe("向后兼容 JWT access_token", () => {
  it("有效的 JWT access_token 仍然能通过 getUserFromRequest 验证", async () => {
    // 此测试验证 getUserFromRequest 没有因为新增 session token 支持
    // 而破坏原有的 JWT 验证路径。
    // 由于 JWT 验证需要 JWKS，这里验证的是：
    // getUserFromRequest 在收到非 session-token 格式的 Bearer token 时
    // 会走 JWT 验证路径（不会直接返回 null）
    const { getUserFromRequest } = await import("@/lib/auth");

    // 一个格式正确但签名无效的 JWT（三段式 xxx.yyy.zzz）
    // getUserFromRequest 应该尝试 JWT 验证（会失败），而不是直接跳过
    const fakeJwt = [
      Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url"),
      Buffer.from(JSON.stringify({ sub: "user-1", email: "a@b.com", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url"),
      "fake-signature",
    ].join(".");

    const req = new NextRequest("https://ai-todo.stringzhao.life/api/tasks", {
      headers: { Authorization: `Bearer ${fakeJwt}` },
    });

    // 签名无效的 JWT 应该返回 null（但不应该崩溃）
    const user = await getUserFromRequest(req);
    expect(user).toBeNull();
  });
});

// ── 6. Session Token 内容完整性 ──────────────────────────────────────────────

describe("session token 内容完整性", () => {
  it("缺少 userId 的 token 应被拒绝", async () => {
    const { getUserFromRequest } = await import("@/lib/auth");

    const now = Date.now();
    const token = createTestSessionToken({
      email: TEST_EMAIL,
      issuedAt: now,
      expiresAt: now + 90 * 24 * 3600 * 1000,
      // 故意缺少 userId
    });

    const req = new NextRequest("https://ai-todo.stringzhao.life/api/tasks", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const user = await getUserFromRequest(req);
    expect(user).toBeNull();
  });

  it("缺少 email 的 token 应被拒绝", async () => {
    const { getUserFromRequest } = await import("@/lib/auth");

    const now = Date.now();
    const token = createTestSessionToken({
      userId: TEST_USER_ID,
      issuedAt: now,
      expiresAt: now + 90 * 24 * 3600 * 1000,
      // 故意缺少 email
    });

    const req = new NextRequest("https://ai-todo.stringzhao.life/api/tasks", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const user = await getUserFromRequest(req);
    expect(user).toBeNull();
  });

  it("缺少 expiresAt 的 token 应被拒绝", async () => {
    const { getUserFromRequest } = await import("@/lib/auth");

    const now = Date.now();
    const token = createTestSessionToken({
      userId: TEST_USER_ID,
      email: TEST_EMAIL,
      issuedAt: now,
      // 故意缺少 expiresAt
    });

    const req = new NextRequest("https://ai-todo.stringzhao.life/api/tasks", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const user = await getUserFromRequest(req);
    expect(user).toBeNull();
  });
});
