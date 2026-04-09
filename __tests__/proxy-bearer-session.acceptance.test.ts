/**
 * proxy.ts — Bearer session_token 验收测试
 *
 * 设计要求：
 *   - CLI 使用 HMAC 签名的 session_token 作为 Bearer <token> 发送
 *   - proxy.ts 必须接受此 token 并放行请求（NextResponse.next()）
 *   - session_token 由 createGatewaySessionCookieValue 创建，
 *     由 verifyGatewaySessionCookieValue 验证，secret 来自
 *     AUTH_GATEWAY_SESSION_SECRET 或 CRON_SECRET 环境变量
 *   - JWT token（来自 base-account）仍然可用
 *   - 无效/过期的 token 应该被拒绝（返回 401）
 *
 * Red Team 注意：本测试基于设计文档，与具体实现无关。
 * 如果测试失败，说明实现尚未满足设计要求。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  createGatewaySessionCookieValue,
  verifyGatewaySessionCookieValue,
} from "@/lib/auth-gateway-session";

// ── 测试常量 ───────────────────────────────────────────────────────────────────

const TEST_USER_ID = "cli-user-uuid-999";
const TEST_EMAIL = "cli@example.com";

// 一个已保护的 API 路径（proxy.ts protectedApiPaths 中定义的）
const PROTECTED_API_PATH = "http://localhost/api/tasks";
// 一个已保护的页面路径
const PROTECTED_PAGE_PATH = "http://localhost/";

// ── 辅助函数 ───────────────────────────────────────────────────────────────────

/**
 * 直接使用库函数构造合法的 session_token（与 proxy.ts 使用的同一实现）
 */
function makeValidSessionToken(
  userId = TEST_USER_ID,
  email = TEST_EMAIL,
  ttlSeconds = 90 * 24 * 3600
): string {
  return createGatewaySessionCookieValue(userId, email, ttlSeconds);
}

/**
 * 构造一个已过期的 session_token（ttl=-1 秒，即立即过期）
 * createGatewaySessionCookieValue 使用 Date.now() + ttlSeconds*1000，
 * 传入负数 ttl 即可使 expiresAt < Date.now()
 */
function makeExpiredSessionToken(): string {
  return createGatewaySessionCookieValue(TEST_USER_ID, TEST_EMAIL, -1);
}

/**
 * 构造签名被篡改的 session_token
 */
function makeTamperedSessionToken(): string {
  const valid = makeValidSessionToken();
  const payload = valid.split(".")[0];
  const fakeSig = crypto.randomBytes(32).toString("base64url");
  return `${payload}.${fakeSig}`;
}

/**
 * 构造一个格式正确但签名无效的 JWT（三段式）
 */
function makeFakeJwt(): string {
  return [
    Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(
      JSON.stringify({
        sub: TEST_USER_ID,
        email: TEST_EMAIL,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: "https://user.stringzhao.life",
        aud: "base-account-client",
      })
    ).toString("base64url"),
    "invalid-signature",
  ].join(".");
}

function makeRequest(url: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(url, { headers });
}

// ── 模拟 getUserFromCookie（JWT 验证，需要 JWKS，不能真实调用）────────────────

// proxy.ts 内部通过 getUserFromCookie 验证 JWT Bearer token。
// 我们需要 mock 这个函数：
//   - 当传入合法的假 JWT（我们控制的 fakeJwt 标识字符串）时，返回用户
//   - 其他情况返回 null（模拟 JWT 验证失败）
//
// 这样测试就能验证 proxy.ts 在 getUserFromCookie 失败时
// 是否会继续尝试 session_token 验证。

vi.mock("@/lib/auth", () => ({
  getUserFromCookie: vi.fn(),
}));

// ── 测试套件 ───────────────────────────────────────────────────────────────────

describe("proxy.ts Bearer token 验收 — session_token 支持", () => {
  let getUserFromCookieMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const authModule = await import("@/lib/auth");
    getUserFromCookieMock = authModule.getUserFromCookie as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── 场景 1：合法 JWT Bearer token ──────────────────────────────────────────

  describe("场景 1：合法 JWT Bearer token", () => {
    it("Bearer JWT 验证通过时，proxy 放行请求（NextResponse.next()）", async () => {
      // getUserFromCookie 模拟 JWT 验证成功
      getUserFromCookieMock.mockResolvedValue({ id: TEST_USER_ID, email: TEST_EMAIL });

      const { proxy } = await import("@/proxy");

      const req = makeRequest(PROTECTED_API_PATH, {
        Authorization: `Bearer ${makeFakeJwt()}`,
      });

      const response = await proxy(req);

      // proxy 应放行（next()），HTTP 状态不是 401/302
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(302);
      // next() 返回的响应 status 为 200 或无 status（代理层放行）
      // NextResponse.next() 在测试中 status 通常为 200
      expect(getUserFromCookieMock).toHaveBeenCalled();
    });
  });

  // ── 场景 2：合法 HMAC session_token 作为 Bearer token ─────────────────────

  describe("场景 2：合法 session_token 作为 Bearer token", () => {
    it("Bearer session_token 验证通过时，proxy 放行请求", async () => {
      // getUserFromCookie 模拟 JWT 验证失败（token 不是 JWT 格式）
      getUserFromCookieMock.mockResolvedValue(null);

      const { proxy } = await import("@/proxy");

      const sessionToken = makeValidSessionToken();

      // 验证 token 本身是合法的
      const verified = verifyGatewaySessionCookieValue(sessionToken);
      expect(verified).not.toBeNull();
      expect(verified!.userId).toBe(TEST_USER_ID);

      const req = makeRequest(PROTECTED_API_PATH, {
        Authorization: `Bearer ${sessionToken}`,
      });

      const response = await proxy(req);

      // proxy 应该放行，不应该返回 401
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(302);
    });

    it("session_token 包含正确的用户信息（userId + email）", () => {
      const token = makeValidSessionToken("my-user-id", "myuser@example.com");
      const payload = verifyGatewaySessionCookieValue(token);

      expect(payload).not.toBeNull();
      expect(payload!.userId).toBe("my-user-id");
      expect(payload!.email).toBe("myuser@example.com");
    });

    it("session_token 在受保护页面路径也应放行（不应重定向）", async () => {
      getUserFromCookieMock.mockResolvedValue(null);

      const { proxy } = await import("@/proxy");
      const sessionToken = makeValidSessionToken();

      const req = makeRequest(PROTECTED_PAGE_PATH, {
        Authorization: `Bearer ${sessionToken}`,
      });

      const response = await proxy(req);

      // Bearer token 的请求不应触发重定向到登录页
      expect(response.status).not.toBe(302);
      expect(response.status).not.toBe(301);
      // 应该是放行（200）或者 401，不是 302 登录重定向
      // 设计要求：Bearer session_token 应放行
      expect(response.status).not.toBe(401);
    });
  });

  // ── 场景 3：无效 Bearer token（既不是 JWT 也不是合法 session_token）─────────

  describe("场景 3：无效 Bearer token", () => {
    it("完全随机的 Bearer token 在受保护 API 路径返回 401", async () => {
      getUserFromCookieMock.mockResolvedValue(null);

      const { proxy } = await import("@/proxy");

      const req = makeRequest(PROTECTED_API_PATH, {
        Authorization: "Bearer totally-invalid-random-garbage-12345",
      });

      const response = await proxy(req);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });

    it("Bearer 后面空字符串在受保护 API 路径返回 401", async () => {
      getUserFromCookieMock.mockResolvedValue(null);

      const { proxy } = await import("@/proxy");

      // "Bearer " + 随机垃圾字符串（空格后面没有内容）
      const req = makeRequest(PROTECTED_API_PATH, {
        Authorization: "Bearer ",
      });

      const response = await proxy(req);

      expect(response.status).toBe(401);
    });

    it("篡改签名的 session_token 在受保护 API 路径返回 401", async () => {
      getUserFromCookieMock.mockResolvedValue(null);

      const { proxy } = await import("@/proxy");

      const tamperedToken = makeTamperedSessionToken();

      // 验证篡改确实使 token 无效
      expect(verifyGatewaySessionCookieValue(tamperedToken)).toBeNull();

      const req = makeRequest(PROTECTED_API_PATH, {
        Authorization: `Bearer ${tamperedToken}`,
      });

      const response = await proxy(req);

      expect(response.status).toBe(401);
    });
  });

  // ── 场景 4：过期的 session_token ────────────────────────────────────────────

  describe("场景 4：过期的 session_token", () => {
    it("过期的 session_token 在受保护 API 路径返回 401", async () => {
      getUserFromCookieMock.mockResolvedValue(null);

      const { proxy } = await import("@/proxy");

      const expiredToken = makeExpiredSessionToken();

      // 验证 token 确实已过期
      expect(verifyGatewaySessionCookieValue(expiredToken)).toBeNull();

      const req = makeRequest(PROTECTED_API_PATH, {
        Authorization: `Bearer ${expiredToken}`,
      });

      const response = await proxy(req);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });

    it("过期的 session_token 不会被当作合法 session 放行", async () => {
      getUserFromCookieMock.mockResolvedValue(null);

      const { proxy } = await import("@/proxy");

      const expiredToken = makeExpiredSessionToken();

      const req = makeRequest(PROTECTED_API_PATH, {
        Authorization: `Bearer ${expiredToken}`,
      });

      const response = await proxy(req);

      // 明确不能放行（非 200）
      expect(response.status).not.toBe(200);
    });
  });

  // ── 场景 5：无 Authorization 头的受保护 API 请求 ────────────────────────────

  describe("场景 5：无 auth header 的受保护 API 请求", () => {
    it("受保护 API 路径（/api/tasks）没有任何认证时返回 401", async () => {
      getUserFromCookieMock.mockResolvedValue(null);

      const { proxy } = await import("@/proxy");

      // 无任何认证头，无 cookie
      const req = makeRequest(PROTECTED_API_PATH);

      const response = await proxy(req);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });

    it("受保护 API 路径（/api/parse-task）没有任何认证时返回 401", async () => {
      getUserFromCookieMock.mockResolvedValue(null);

      const { proxy } = await import("@/proxy");

      const req = makeRequest("http://localhost/api/parse-task");

      const response = await proxy(req);

      expect(response.status).toBe(401);
    });

    it("受保护 API 路径（/api/spaces）没有任何认证时返回 401", async () => {
      getUserFromCookieMock.mockResolvedValue(null);

      const { proxy } = await import("@/proxy");

      const req = makeRequest("http://localhost/api/spaces");

      const response = await proxy(req);

      expect(response.status).toBe(401);
    });
  });

  // ── 场景 6：AUTH_DEV_BYPASS 不影响生产行为 ──────────────────────────────────

  describe("场景 6：AUTH_DEV_BYPASS 未设置时的正常认证流程", () => {
    it("AUTH_DEV_BYPASS 未设置，无效 token 不会被绕过", async () => {
      // 确保 AUTH_DEV_BYPASS 不为 true
      const originalBypass = process.env.AUTH_DEV_BYPASS;
      delete process.env.AUTH_DEV_BYPASS;

      try {
        getUserFromCookieMock.mockResolvedValue(null);
        const { proxy } = await import("@/proxy");

        const req = makeRequest(PROTECTED_API_PATH, {
          Authorization: "Bearer invalid-token",
        });

        const response = await proxy(req);
        expect(response.status).toBe(401);
      } finally {
        if (originalBypass !== undefined) {
          process.env.AUTH_DEV_BYPASS = originalBypass;
        }
      }
    });
  });

  // ── 场景 7：不受保护的路径不触发认证 ─────────────────────────────────────────

  describe("场景 7：非受保护路径无需认证", () => {
    it("公开路径（/auth/callback）不触发认证检查", async () => {
      const { proxy } = await import("@/proxy");

      // /auth/callback 是公开路径，不在 protectedApiPaths 或 protectedPaths 中
      const req = makeRequest("http://localhost/auth/callback?authorized=0&error=auth_failed");

      const response = await proxy(req);

      // 应该放行（处理 callback 路由），不是 401
      expect(response.status).not.toBe(401);
    });
  });
});
