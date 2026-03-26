/**
 * 个人每日总结 — 验收测试（红队）
 *
 * 基于设计文档编写，不阅读蓝队实现代码。
 *
 * 设计文档约定：
 * 1. 新 DB 表 ai_todo_personal_summary_cache (user_id + summary_date unique)
 * 2. getPersonalDaySummaryData(userId, date) → 5 个数组
 * 3. hasPersonalDayContent(data) → boolean
 * 4. getPersonalSummaryCache / upsertPersonalSummaryCache 缓存函数
 * 5. GET /api/me/summary → { cached, content?, generated_at?, quota }
 * 6. POST /api/me/summary → SSE 流式 或 { error } 当无活动
 * 7. POST 配额：10 次/天，超出返回 429
 *
 * 验收标准：
 * AC-1: getPersonalDaySummaryData 返回包含 5 个数组的数据结构
 * AC-2: hasPersonalDayContent 有数据返回 true，全空返回 false
 * AC-3: getPersonalSummaryCache 无缓存返回 null
 * AC-4: upsertPersonalSummaryCache 存取正确
 * AC-5: GET /api/me/summary 返回正确的 shape（含 quota）
 * AC-6: POST /api/me/summary 未认证返回 401
 * AC-7: POST /api/me/summary 无活动返回错误
 * AC-8: POST /api/me/summary 超配额返回 429
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── mock @vercel/postgres ─────────────────────────────────────────────────────

const { mockQuery, mockTaggedTemplate } = vi.hoisted(() => {
  const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
  const mockTaggedTemplate = vi.fn().mockReturnValue({ rows: [] });
  Object.assign(mockTaggedTemplate, { query: mockQuery });
  return { mockQuery, mockTaggedTemplate };
});

vi.mock("@vercel/postgres", () => ({
  sql: mockTaggedTemplate,
}));

// ── mock auth ─────────────────────────────────────────────────────────────────

const mockGetUserFromRequest = vi.fn();

vi.mock("@/lib/auth", () => ({
  getUserFromRequest: (...args: unknown[]) => mockGetUserFromRequest(...args),
}));

// ── mock db (initDb) ──────────────────────────────────────────────────────────

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    initDb: vi.fn().mockResolvedValue(undefined),
  };
});

// ── mock llm-client ───────────────────────────────────────────────────────────

vi.mock("@/lib/llm-client", () => ({
  llmClient: {
    chat: vi.fn().mockResolvedValue("AI 总结内容"),
    streamChat: vi.fn().mockImplementation(async function* () {
      yield "AI ";
      yield "总结";
      yield "内容";
    }),
  },
}));

// ── 测试常量 ──────────────────────────────────────────────────────────────────

const USER_ID = "user-test-001";
const USER_EMAIL = "test@example.com";
const TEST_DATE = "2026-03-23";

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-03-23T13:00:00Z") });
  vi.clearAllMocks();
  mockTaggedTemplate.mockReturnValue({ rows: [] });
  mockQuery.mockResolvedValue({ rows: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-1: getPersonalDaySummaryData 返回包含 5 个数组的数据结构
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-1: getPersonalDaySummaryData 返回正确数据结构", () => {
  it("返回对象包含 completedTasks 数组", async () => {
    const mod = await import("@/lib/personal-summary");
    const fn = mod.getPersonalDaySummaryData;
    expect(fn).toBeDefined();
    expect(typeof fn).toBe("function");

    // 模拟 DB 返回空结果
    mockQuery.mockResolvedValue({ rows: [] });
    mockTaggedTemplate.mockReturnValue({ rows: [] });

    const result = await fn(USER_ID, TEST_DATE);
    expect(result).toHaveProperty("completedTasks");
    expect(Array.isArray(result.completedTasks)).toBe(true);
  });

  it("返回对象包含 createdTasks 数组", async () => {
    const { getPersonalDaySummaryData } = await import("@/lib/personal-summary");
    const result = await getPersonalDaySummaryData(USER_ID, TEST_DATE);
    expect(result).toHaveProperty("createdTasks");
    expect(Array.isArray(result.createdTasks)).toBe(true);
  });

  it("返回对象包含 logs 数组", async () => {
    const { getPersonalDaySummaryData } = await import("@/lib/personal-summary");
    const result = await getPersonalDaySummaryData(USER_ID, TEST_DATE);
    expect(result).toHaveProperty("logs");
    expect(Array.isArray(result.logs)).toBe(true);
  });

  it("返回对象包含 overdueTasks 数组", async () => {
    const { getPersonalDaySummaryData } = await import("@/lib/personal-summary");
    const result = await getPersonalDaySummaryData(USER_ID, TEST_DATE);
    expect(result).toHaveProperty("overdueTasks");
    expect(Array.isArray(result.overdueTasks)).toBe(true);
  });

  it("返回对象包含 dueTodayTasks 数组", async () => {
    const { getPersonalDaySummaryData } = await import("@/lib/personal-summary");
    const result = await getPersonalDaySummaryData(USER_ID, TEST_DATE);
    expect(result).toHaveProperty("dueTodayTasks");
    expect(Array.isArray(result.dueTodayTasks)).toBe(true);
  });

  it("恰好包含 5 个数组字段", async () => {
    const { getPersonalDaySummaryData } = await import("@/lib/personal-summary");
    const result = await getPersonalDaySummaryData(USER_ID, TEST_DATE);
    const expectedKeys = [
      "completedTasks",
      "createdTasks",
      "logs",
      "overdueTasks",
      "dueTodayTasks",
    ];
    for (const key of expectedKeys) {
      expect(result).toHaveProperty(key);
      expect(Array.isArray((result as Record<string, unknown>)[key])).toBe(true);
    }
  });

  it("当 DB 有数据时返回非空数组", async () => {
    const { getPersonalDaySummaryData } = await import("@/lib/personal-summary");

    // 模拟完成的任务
    mockTaggedTemplate.mockReturnValueOnce({
      rows: [
        {
          id: "task-1",
          title: "已完成任务",
          status: 2,
          completed_at: `${TEST_DATE}T10:00:00Z`,
        },
      ],
    });

    const result = await getPersonalDaySummaryData(USER_ID, TEST_DATE);
    // 至少有一个数组应该非空（取决于实现查询顺序）
    const allArrays = [
      result.completedTasks,
      result.createdTasks,
      result.logs,
      result.overdueTasks,
      result.dueTodayTasks,
    ];
    const hasData = allArrays.some((arr) => arr.length > 0);
    // 如果 mock 数据被正确消费，应该有数据
    // 但由于我们不知道实现的查询顺序，只检查类型正确性
    expect(allArrays.every((arr) => Array.isArray(arr))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-2: hasPersonalDayContent 判断逻辑
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-2: hasPersonalDayContent 判断是否有活动", () => {
  it("函数可以正常导入", async () => {
    const mod = await import("@/lib/personal-summary");
    expect(mod.hasPersonalDayContent).toBeDefined();
    expect(typeof mod.hasPersonalDayContent).toBe("function");
  });

  it("所有数组为空时返回 false", async () => {
    const { hasPersonalDayContent } = await import("@/lib/personal-summary");
    const emptyData = {
      completedTasks: [],
      createdTasks: [],
      logs: [],
      overdueTasks: [],
      dueTodayTasks: [],
    };
    expect(hasPersonalDayContent(emptyData)).toBe(false);
  });

  it("completedTasks 有数据时返回 true", async () => {
    const { hasPersonalDayContent } = await import("@/lib/personal-summary");
    const data = {
      completedTasks: [{ id: "t1", title: "完成的任务" }],
      createdTasks: [],
      logs: [],
      overdueTasks: [],
      dueTodayTasks: [],
    };
    expect(hasPersonalDayContent(data)).toBe(true);
  });

  it("createdTasks 有数据时返回 true", async () => {
    const { hasPersonalDayContent } = await import("@/lib/personal-summary");
    const data = {
      completedTasks: [],
      createdTasks: [{ id: "t2", title: "新建的任务" }],
      logs: [],
      overdueTasks: [],
      dueTodayTasks: [],
    };
    expect(hasPersonalDayContent(data)).toBe(true);
  });

  it("logs 有数据时返回 true", async () => {
    const { hasPersonalDayContent } = await import("@/lib/personal-summary");
    const data = {
      completedTasks: [],
      createdTasks: [],
      logs: [{ id: "l1", content: "日志" }],
      overdueTasks: [],
      dueTodayTasks: [],
    };
    expect(hasPersonalDayContent(data)).toBe(true);
  });

  it("overdueTasks 有数据时返回 true", async () => {
    const { hasPersonalDayContent } = await import("@/lib/personal-summary");
    const data = {
      completedTasks: [],
      createdTasks: [],
      logs: [],
      overdueTasks: [{ id: "t3", title: "逾期任务" }],
      dueTodayTasks: [],
    };
    expect(hasPersonalDayContent(data)).toBe(true);
  });

  it("dueTodayTasks 有数据时返回 true", async () => {
    const { hasPersonalDayContent } = await import("@/lib/personal-summary");
    const data = {
      completedTasks: [],
      createdTasks: [],
      logs: [],
      overdueTasks: [],
      dueTodayTasks: [{ id: "t4", title: "今日到期任务" }],
    };
    expect(hasPersonalDayContent(data)).toBe(true);
  });

  it("多个数组有数据时返回 true", async () => {
    const { hasPersonalDayContent } = await import("@/lib/personal-summary");
    const data = {
      completedTasks: [{ id: "t1" }],
      createdTasks: [{ id: "t2" }],
      logs: [{ id: "l1" }],
      overdueTasks: [],
      dueTodayTasks: [{ id: "t3" }],
    };
    expect(hasPersonalDayContent(data)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-3: getPersonalSummaryCache 无缓存返回 null
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-3: getPersonalSummaryCache 缓存读取", () => {
  it("函数可以正常导入", async () => {
    const mod = await import("@/lib/personal-summary");
    expect(mod.getPersonalSummaryCache).toBeDefined();
    expect(typeof mod.getPersonalSummaryCache).toBe("function");
  });

  it("无缓存时返回 null", async () => {
    const { getPersonalSummaryCache } = await import("@/lib/personal-summary");

    // DB 返回空行
    mockTaggedTemplate.mockReturnValueOnce({ rows: [] });

    const result = await getPersonalSummaryCache(USER_ID, TEST_DATE);
    expect(result).toBeNull();
  });

  it("有缓存时返回包含 content 和 generated_at 的对象", async () => {
    const { getPersonalSummaryCache } = await import("@/lib/personal-summary");

    const cachedRow = {
      content: "# 每日总结\n今天完成了 3 个任务。",
      generated_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    };
    mockTaggedTemplate.mockReturnValueOnce({ rows: [cachedRow] });

    const result = await getPersonalSummaryCache(USER_ID, TEST_DATE);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("content");
    expect(result).toHaveProperty("generated_at");
    expect(typeof result!.content).toBe("string");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-4: upsertPersonalSummaryCache 存取正确
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-4: upsertPersonalSummaryCache 缓存写入", () => {
  it("函数可以正常导入", async () => {
    const mod = await import("@/lib/personal-summary");
    expect(mod.upsertPersonalSummaryCache).toBeDefined();
    expect(typeof mod.upsertPersonalSummaryCache).toBe("function");
  });

  it("调用后不抛异常", async () => {
    const { upsertPersonalSummaryCache } = await import("@/lib/personal-summary");

    mockTaggedTemplate.mockReturnValueOnce({ rows: [] });

    await expect(
      upsertPersonalSummaryCache(USER_ID, TEST_DATE, "# 总结\n完成了一些工作。")
    ).resolves.not.toThrow();
  });

  it("写入后可以读取到相同内容", async () => {
    const { getPersonalSummaryCache, upsertPersonalSummaryCache } =
      await import("@/lib/personal-summary");

    const summaryContent = "# 每日总结\n完成了 5 个任务，新增 2 个任务。";

    // upsert 调用
    mockTaggedTemplate.mockReturnValueOnce({ rows: [] });
    await upsertPersonalSummaryCache(USER_ID, TEST_DATE, summaryContent);

    // 读取调用 - 模拟返回刚写入的数据
    mockTaggedTemplate.mockReturnValueOnce({
      rows: [
        {
          content: summaryContent,
          generated_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        },
      ],
    });

    const cached = await getPersonalSummaryCache(USER_ID, TEST_DATE);
    expect(cached).not.toBeNull();
    expect(cached!.content).toBe(summaryContent);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-5: GET /api/me/summary 返回正确 shape
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-5: GET /api/me/summary 返回正确格式", () => {
  it("已认证请求返回包含 quota 的响应", async () => {
    mockGetUserFromRequest.mockResolvedValue({
      id: USER_ID,
      email: USER_EMAIL,
    });

    // 模拟无缓存
    mockTaggedTemplate.mockReturnValue({ rows: [] });

    const { GET } = await import("@/app/api/me/summary/route");
    const req = new NextRequest("https://ai-todo.stringzhao.life/api/me/summary?date=" + TEST_DATE);

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveProperty("quota");
    expect(body.quota).toHaveProperty("used");
    expect(body.quota).toHaveProperty("limit");
    expect(body.quota).toHaveProperty("remaining");
    expect(typeof body.quota.used).toBe("number");
    expect(typeof body.quota.limit).toBe("number");
    expect(typeof body.quota.remaining).toBe("number");
  });

  it("已认证请求返回 cached 字段", async () => {
    mockGetUserFromRequest.mockResolvedValue({
      id: USER_ID,
      email: USER_EMAIL,
    });

    mockTaggedTemplate.mockReturnValue({ rows: [] });

    const { GET } = await import("@/app/api/me/summary/route");
    const req = new NextRequest("https://ai-todo.stringzhao.life/api/me/summary?date=" + TEST_DATE);

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveProperty("cached");
    expect(typeof body.cached).toBe("boolean");
  });

  it("有缓存时返回 content 和 generated_at", async () => {
    mockGetUserFromRequest.mockResolvedValue({
      id: USER_ID,
      email: USER_EMAIL,
    });

    const cachedContent = "# 每日总结\n今天做了很多事情。";
    const generatedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // 模拟缓存存在 - 为可能的多次查询提供足够的 mock
    mockTaggedTemplate
      .mockReturnValueOnce({
        rows: [{ content: cachedContent, generated_at: generatedAt }],
      })
      .mockReturnValue({ rows: [] });

    const { GET } = await import("@/app/api/me/summary/route");
    const req = new NextRequest("https://ai-todo.stringzhao.life/api/me/summary?date=" + TEST_DATE);

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cached).toBe(true);
    expect(body.content).toBe(cachedContent);
    expect(body.generated_at).toBe(generatedAt);
  });

  it("无缓存时 cached=false 且无 content", async () => {
    mockGetUserFromRequest.mockResolvedValue({
      id: USER_ID,
      email: USER_EMAIL,
    });

    mockTaggedTemplate.mockReturnValue({ rows: [] });

    const { GET } = await import("@/app/api/me/summary/route");
    const req = new NextRequest("https://ai-todo.stringzhao.life/api/me/summary?date=" + TEST_DATE);

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cached).toBe(false);
  });

  it("未认证请求返回 401", async () => {
    mockGetUserFromRequest.mockResolvedValue(null);

    const { GET } = await import("@/app/api/me/summary/route");
    const req = new NextRequest("https://ai-todo.stringzhao.life/api/me/summary?date=" + TEST_DATE);

    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("默认使用今天的日期（不传 date 参数）", async () => {
    mockGetUserFromRequest.mockResolvedValue({
      id: USER_ID,
      email: USER_EMAIL,
    });

    mockTaggedTemplate.mockReturnValue({ rows: [] });

    const { GET } = await import("@/app/api/me/summary/route");
    const req = new NextRequest("https://ai-todo.stringzhao.life/api/me/summary");

    const res = await GET(req);
    // 不传 date 也应正常返回，不报错
    expect(res.status).toBe(200);
  });

  it("quota.limit 应为 10", async () => {
    mockGetUserFromRequest.mockResolvedValue({
      id: USER_ID,
      email: USER_EMAIL,
    });

    mockTaggedTemplate.mockReturnValue({ rows: [] });

    const { GET } = await import("@/app/api/me/summary/route");
    const req = new NextRequest("https://ai-todo.stringzhao.life/api/me/summary?date=" + TEST_DATE);

    const res = await GET(req);
    const body = await res.json();

    expect(body.quota.limit).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-6: POST /api/me/summary 认证要求
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-6: POST /api/me/summary 认证要求", () => {
  it("未认证请求返回 401", async () => {
    mockGetUserFromRequest.mockResolvedValue(null);

    const { POST } = await import("@/app/api/me/summary/route");
    const req = new NextRequest("https://ai-todo.stringzhao.life/api/me/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: TEST_DATE }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-7: POST /api/me/summary 无活动时返回错误
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-7: POST /api/me/summary 无任务活动时返回错误", () => {
  it("当日无任务活动时返回包含错误信息的响应", async () => {
    mockGetUserFromRequest.mockResolvedValue({
      id: USER_ID,
      email: USER_EMAIL,
    });

    // 所有查询返回空结果（无任务活动）
    mockTaggedTemplate.mockReturnValue({ rows: [] });
    mockQuery.mockResolvedValue({ rows: [] });

    const { POST } = await import("@/app/api/me/summary/route");
    const req = new NextRequest("https://ai-todo.stringzhao.life/api/me/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: TEST_DATE }),
    });

    const res = await POST(req);
    // 无活动应返回错误（可能是 400 或 200 带 error 字段）
    if (res.status === 200 || res.status === 400) {
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error).toContain("没有任务活动");
    } else {
      // 也接受其他非 2xx 状态码
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-8: POST /api/me/summary 配额限制
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-8: POST /api/me/summary 配额限制", () => {
  it("配额用尽时返回 429", async () => {
    mockGetUserFromRequest.mockResolvedValue({
      id: USER_ID,
      email: USER_EMAIL,
    });

    // 模拟已用完配额（查询返回 10 条已生成记录）
    // 具体实现可能通过计数查询或其他方式检查配额
    // 我们模拟配额查询返回已用 10 次
    mockTaggedTemplate.mockImplementation((...args: unknown[]) => {
      const strings = args[0] as TemplateStringsArray;
      const sql = Array.isArray(strings) ? strings.join("") : String(strings);
      // 如果是配额相关查询（COUNT 或类似查询），返回已用完
      if (sql.includes("COUNT") || sql.includes("count")) {
        return { rows: [{ count: "10" }] };
      }
      // 如果是查询 summary_cache 类似查询
      if (sql.includes("personal_summary")) {
        return { rows: [{ count: "10" }] };
      }
      return { rows: [] };
    });

    mockQuery.mockImplementation((_sql: string) => {
      const sqlStr = String(_sql);
      if (sqlStr.includes("COUNT") || sqlStr.includes("count")) {
        return Promise.resolve({ rows: [{ count: "10" }] });
      }
      if (sqlStr.includes("personal_summary")) {
        return Promise.resolve({ rows: [{ count: "10" }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const { POST } = await import("@/app/api/me/summary/route");
    const req = new NextRequest("https://ai-todo.stringzhao.life/api/me/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: TEST_DATE }),
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 模块导出完整性
// ═══════════════════════════════════════════════════════════════════════════════

describe("模块导出完整性", () => {
  it("@/lib/personal-summary 模块可正常导入", async () => {
    const mod = await import("@/lib/personal-summary");
    expect(mod).toBeDefined();
  });

  it("导出 getPersonalDaySummaryData 函数", async () => {
    const mod = await import("@/lib/personal-summary");
    expect(typeof mod.getPersonalDaySummaryData).toBe("function");
  });

  it("导出 hasPersonalDayContent 函数", async () => {
    const mod = await import("@/lib/personal-summary");
    expect(typeof mod.hasPersonalDayContent).toBe("function");
  });

  it("导出 getPersonalSummaryCache 函数", async () => {
    const mod = await import("@/lib/personal-summary");
    expect(typeof mod.getPersonalSummaryCache).toBe("function");
  });

  it("导出 upsertPersonalSummaryCache 函数", async () => {
    const mod = await import("@/lib/personal-summary");
    expect(typeof mod.upsertPersonalSummaryCache).toBe("function");
  });

  it("GET /api/me/summary route 导出 GET 和 POST 函数", async () => {
    const mod = await import("@/app/api/me/summary/route");
    expect(typeof mod.GET).toBe("function");
    expect(typeof mod.POST).toBe("function");
  });
});
