/**
 * 邀请码分页加载 — 验收测试（红队）
 *
 * 基于设计文档编写，不阅读蓝队实现代码。
 *
 * 设计文档约定：
 * 1. GET /api/invitation/codes 支持 limit（默认 3）和 offset（默认 0）query 参数
 * 2. 响应格式：{ codes, quota, total, hasMore }
 * 3. 后端从 auth 服务获取全量数据后，过滤 REVOKED，然后 slice 返回分页结果
 * 4. auto-fill 仅在 offset=0 时执行
 *
 * 验收标准：
 * AC-1: 默认参数应返回最多 3 个 codes（limit 默认 3）
 * AC-2: limit=2&offset=0 应只返回 2 个 codes
 * AC-3: offset 超过总数应返回空 codes 数组
 * AC-4: 响应包含 total 和 hasMore 字段
 * AC-5: hasMore 在有更多数据时为 true，否则为 false
 * AC-6: REVOKED 状态的 codes 应被过滤掉
 * AC-7: auto-fill 仅在 offset=0 时触发
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── mock auth ─────────────────────────────────────────────────────────────────

const mockGetUserFromRequest = vi.fn();

vi.mock("@/lib/auth", () => ({
  getUserFromRequest: (...args: unknown[]) => mockGetUserFromRequest(...args),
}));

// ── mock global fetch（拦截 auth 服务请求） ──────────────────────────────────

const mockFetch = vi.fn();

// ── helpers ──────────────────────────────────────────────────────────────────

const TEST_USER = { id: "user-001", email: "test@example.com" };

/** 生成 N 个测试邀请码 */
function makeCodes(
  n: number,
  overrides: Record<string, unknown> = {}
): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({
    code: `CODE${String(i + 1).padStart(4, "0")}`,
    status: "UNUSED",
    createdAt: new Date().toISOString(),
    ...overrides,
  }));
}

/** 构造 auth 服务的标准响应 */
function makeAuthResponse(
  codes: Record<string, unknown>[],
  quota = { used: codes.length, total: 5 }
) {
  return {
    ok: true,
    json: () => Promise.resolve({ codes, quota }),
  };
}

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("https://ai-todo.stringzhao.life/api/invitation/codes");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString(), {
    headers: { cookie: "access_token=test-jwt" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  mockGetUserFromRequest.mockResolvedValue(TEST_USER);

  // 默认 mock: fetch 返回 5 个 UNUSED codes（模拟 auth 服务全量数据）
  vi.stubGlobal(
    "fetch",
    mockFetch.mockResolvedValue(makeAuthResponse(makeCodes(5)))
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-1: 默认参数应返回最多 3 个 codes（limit 默认 3）
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-1: 默认分页参数", () => {
  it("不传 limit/offset 时，默认返回最多 3 个 codes", async () => {
    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body.codes)).toBe(true);
    expect(body.codes.length).toBeLessThanOrEqual(3);
    // auth 服务有 5 个 codes，默认 limit=3 应该只返回 3 个
    expect(body.codes.length).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-2: limit=2&offset=0 应只返回 2 个 codes
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-2: 自定义 limit", () => {
  it("limit=2&offset=0 应只返回 2 个 codes", async () => {
    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest({ limit: "2", offset: "0" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.codes.length).toBe(2);
  });

  it("limit=1 应只返回 1 个 code", async () => {
    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest({ limit: "1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.codes.length).toBe(1);
  });

  it("limit=10 但只有 5 个 codes 时，返回全部 5 个", async () => {
    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest({ limit: "10", offset: "0" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.codes.length).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-3: offset 超过总数应返回空 codes 数组
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-3: offset 超出范围", () => {
  it("offset=100 且只有 5 个 codes → 返回空数组", async () => {
    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest({ offset: "100" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.codes).toEqual([]);
    expect(body.codes.length).toBe(0);
  });

  it("offset 等于总数时也返回空数组", async () => {
    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest({ offset: "5" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.codes).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-4: 响应包含 total 和 hasMore 字段
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-4: 响应格式包含 total 和 hasMore", () => {
  it("响应 JSON 包含 codes、quota、total、hasMore 四个字段", async () => {
    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveProperty("codes");
    expect(body).toHaveProperty("quota");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("hasMore");
  });

  it("total 应为过滤 REVOKED 后的总数（number 类型）", async () => {
    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(typeof body.total).toBe("number");
    // auth 服务返回 5 个 UNUSED codes，无 REVOKED，total 应为 5
    expect(body.total).toBe(5);
  });

  it("hasMore 应为 boolean 类型", async () => {
    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(typeof body.hasMore).toBe("boolean");
  });

  it("quota 应包含 used 和 total", async () => {
    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.quota).toHaveProperty("used");
    expect(body.quota).toHaveProperty("total");
    expect(typeof body.quota.used).toBe("number");
    expect(typeof body.quota.total).toBe("number");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-5: hasMore 在有更多数据时为 true，否则为 false
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-5: hasMore 正确性", () => {
  it("5 个 codes，limit=3，offset=0 → hasMore=true", async () => {
    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest({ limit: "3", offset: "0" }));
    const body = await res.json();

    expect(body.hasMore).toBe(true);
  });

  it("5 个 codes，limit=3，offset=3 → hasMore=false（剩余 2 个 < limit）", async () => {
    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest({ limit: "3", offset: "3" }));
    const body = await res.json();

    // offset=3, 剩余 2 个，offset+limit=6 > total=5，所以 hasMore=false
    expect(body.hasMore).toBe(false);
  });

  it("5 个 codes，limit=5，offset=0 → hasMore=false（刚好取完）", async () => {
    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest({ limit: "5", offset: "0" }));
    const body = await res.json();

    expect(body.hasMore).toBe(false);
  });

  it("5 个 codes，limit=2，offset=2 → hasMore=true（还剩 1 个）", async () => {
    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest({ limit: "2", offset: "2" }));
    const body = await res.json();

    // offset+limit=4 < total=5，hasMore=true
    expect(body.hasMore).toBe(true);
  });

  it("auth 服务无 codes → hasMore=false", async () => {
    mockFetch.mockResolvedValue(makeAuthResponse([], { used: 0, total: 3 }));

    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.hasMore).toBe(false);
    expect(body.total).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-6: REVOKED 状态的 codes 应被过滤掉
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-6: REVOKED 过滤", () => {
  it("REVOKED codes 不出现在响应中", async () => {
    const codes = [
      ...makeCodes(3), // 3 个 UNUSED
      ...makeCodes(2, { status: "REVOKED" }), // 2 个 REVOKED
    ];
    mockFetch.mockResolvedValue(makeAuthResponse(codes, { used: 5, total: 5 }));

    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest({ limit: "10" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    // 只返回 3 个非 REVOKED 的
    expect(body.codes.length).toBe(3);
    for (const code of body.codes) {
      expect(code.status).not.toBe("REVOKED");
    }
  });

  it("total 应基于过滤后的数量（不含 REVOKED）", async () => {
    const codes = [
      ...makeCodes(3),
      ...makeCodes(2, { status: "REVOKED" }),
    ];
    mockFetch.mockResolvedValue(makeAuthResponse(codes, { used: 5, total: 5 }));

    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest({ limit: "10" }));
    const body = await res.json();

    // total 应为 3（过滤掉 2 个 REVOKED 后）
    expect(body.total).toBe(3);
  });

  it("hasMore 基于过滤后的总数计算", async () => {
    const codes = [
      ...makeCodes(4),
      ...makeCodes(3, { status: "REVOKED" }),
    ];
    mockFetch.mockResolvedValue(makeAuthResponse(codes, { used: 7, total: 7 }));

    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest({ limit: "3", offset: "0" }));
    const body = await res.json();

    // 过滤后 4 个有效 codes，limit=3，offset=0 → hasMore=true
    expect(body.total).toBe(4);
    expect(body.hasMore).toBe(true);
  });

  it("全部都是 REVOKED → codes 为空，total=0", async () => {
    const codes = makeCodes(3, { status: "REVOKED" });
    mockFetch.mockResolvedValue(makeAuthResponse(codes, { used: 3, total: 5 }));

    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.codes).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.hasMore).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-7: auto-fill 仅在 offset=0 时触发
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-7: auto-fill 仅在 offset=0 时触发", () => {
  it("offset=0 且 codes 不足配额时，应触发 generate 调用", async () => {
    // auth 服务返回 2 个 codes，配额 total=5，缺 3 个
    const initialCodes = makeCodes(2);
    const filledCodes = makeCodes(5);

    mockFetch
      // 第一次 fetchCodes：返回不足配额的 codes
      .mockResolvedValueOnce(
        makeAuthResponse(initialCodes, { used: 2, total: 5 })
      )
      // generate 调用（3 次）
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      // 第二次 fetchCodes：补充后的 codes
      .mockResolvedValueOnce(
        makeAuthResponse(filledCodes, { used: 5, total: 5 })
      );

    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest({ offset: "0" }));
    const body = await res.json();

    expect(res.status).toBe(200);

    // 应至少调用过 generate 端点（fetch 调用次数 > 1 次 fetchCodes）
    // fetchCodes(1次) + generate(3次) + fetchCodes(1次) = 5 次
    expect(mockFetch.mock.calls.length).toBeGreaterThan(1);

    // 验证 generate 调用包含 POST 方法
    const postCalls = mockFetch.mock.calls.filter(
      (call: unknown[]) =>
        call[1] && (call[1] as Record<string, string>).method === "POST"
    );
    expect(postCalls.length).toBe(3); // 缺 3 个，generate 3 次
  });

  it("offset>0 时，不应触发 generate 调用", async () => {
    const codes = makeCodes(2);
    // 配额 total=5，只有 2 个 codes，但 offset>0 不应 auto-fill
    mockFetch.mockResolvedValue(
      makeAuthResponse(codes, { used: 2, total: 5 })
    );

    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest({ offset: "3" }));

    expect(res.status).toBe(200);

    // 只应有 1 次 fetch 调用（fetchCodes），不应有 generate POST 调用
    const postCalls = mockFetch.mock.calls.filter(
      (call: unknown[]) =>
        call[1] && (call[1] as Record<string, string>).method === "POST"
    );
    expect(postCalls.length).toBe(0);
  });

  it("offset=0 但 codes 已满配额时，不触发 generate", async () => {
    const codes = makeCodes(5);
    mockFetch.mockResolvedValue(
      makeAuthResponse(codes, { used: 5, total: 5 })
    );

    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest({ offset: "0" }));

    expect(res.status).toBe(200);

    // 只有 1 次 fetchCodes 调用，无 generate
    const postCalls = mockFetch.mock.calls.filter(
      (call: unknown[]) =>
        call[1] && (call[1] as Record<string, string>).method === "POST"
    );
    expect(postCalls.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 边界情况：未认证用户
// ═══════════════════════════════════════════════════════════════════════════════

describe("未认证用户", () => {
  it("未登录用户请求 → 返回 401", async () => {
    mockGetUserFromRequest.mockResolvedValue(null);

    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 边界情况：auth 服务不可用
// ═══════════════════════════════════════════════════════════════════════════════

describe("auth 服务不可用", () => {
  it("auth 服务返回错误时，应返回空结果而非 500", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const { GET } = await import("@/app/api/invitation/codes/route");
    const res = await GET(makeRequest());
    const body = await res.json();

    // 应优雅降级，返回空结果
    expect(res.status).toBe(200);
    expect(body.codes).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.hasMore).toBe(false);
  });
});
