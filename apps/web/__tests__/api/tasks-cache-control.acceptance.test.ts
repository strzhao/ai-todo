/**
 * API Route acceptance test (red team): GET /api/tasks Cache-Control 契约
 *
 * 背景 bug：点击完成任务后任务仍留在列表，刷新页面才消失。
 * 根因：GET /api/tasks 响应头含 stale-while-revalidate，浏览器在客户端 SWR
 * 发起 revalidation 请求时直接复用 HTTP 缓存的旧 body，覆盖乐观更新结果。
 *
 * 验收契约（设计意图，黑盒断言真实 Response headers/body）：
 * - C1: GET /api/tasks（默认活跃任务分支）与 GET /api/tasks?filter=completed
 *       （已完成分支）的 Cache-Control 必须含 no-store，且不得含
 *       stale-while-revalidate，不得出现大于 0 的 max-age
 * - C2: 响应结构不回归——默认分支返回 200 + Task[] JSON 数组；
 *       completed 分支保留 X-Has-More 头；未认证返回 401 + { error }
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeGET } from "../helpers/make-request";
import { TEST_USER } from "../helpers/fixtures";

// Mock all external dependencies（沿用 tasks-route.acceptance.test.ts 的既有模式）
vi.mock("@/lib/auth");
vi.mock("@/lib/db");
vi.mock("@/lib/route-timing", () => ({
  createRouteTimer: vi.fn().mockImplementation(() => ({
    track: vi.fn().mockImplementation((_name: string, fn: () => unknown) => fn()),
    json: vi
      .fn()
      .mockImplementation((data: unknown, init?: ResponseInit) => Response.json(data, init)),
    empty: vi.fn().mockImplementation((status: number) => new Response(null, { status })),
  })),
}));
vi.mock("@/lib/notifications", () => ({
  getUnreadCount: vi.fn().mockResolvedValue(0),
  fireNotification: vi.fn(),
  fireNotifications: vi.fn(),
}));
vi.mock("@/lib/ai-flow-log", () => ({
  aiFlowLog: vi.fn(),
  getAiTraceIdFromHeaders: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/spaces", () => ({
  requireSpaceMember: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/pg", () => ({
  sql: Object.assign(vi.fn(), { query: vi.fn() }),
}));

import { getUserFromRequest } from "@/lib/auth";
import { initDb, getTasks, getCompletedTasks } from "@/lib/db";

const mockTask = {
  id: "task-1",
  title: "Test task",
  status: 0,
  priority: 2,
  type: 0,
  user_id: TEST_USER.id,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  parent_id: null,
  space_id: null,
  tags: [],
};

/**
 * C1 断言：Cache-Control 必须彻底禁止 HTTP 缓存复用。
 * - 必须含 no-store
 * - 不得含 stale-while-revalidate（bug 根因指令）
 * - 若声明 max-age，值必须为 0（不得大于 0）
 */
function expectNoHttpCaching(res: Response) {
  const cacheControl = res.headers.get("Cache-Control");
  expect(cacheControl, "Cache-Control 响应头必须存在").toBeTruthy();
  const cc = (cacheControl as string).toLowerCase();
  expect(cc).toContain("no-store");
  expect(cc).not.toContain("stale-while-revalidate");
  const maxAgeMatch = cc.match(/max-age\s*=\s*(\d+)/);
  if (maxAgeMatch) {
    expect(parseInt(maxAgeMatch[1], 10), `max-age 不得大于 0，实际 Cache-Control: ${cc}`).toBe(0);
  }
}

describe("GET /api/tasks — Cache-Control 契约（C1）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserFromRequest).mockResolvedValue(TEST_USER);
    vi.mocked(initDb).mockResolvedValue(undefined);
  });

  it("默认活跃任务分支：Cache-Control 含 no-store，不含 stale-while-revalidate，无大于 0 的 max-age", async () => {
    vi.mocked(getTasks).mockResolvedValue([mockTask as never]);
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(makeGET("/api/tasks"));
    expect(res.status).toBe(200);
    expectNoHttpCaching(res);
  });

  it("filter=completed 分支：Cache-Control 含 no-store，不含 stale-while-revalidate，无大于 0 的 max-age", async () => {
    vi.mocked(getCompletedTasks).mockResolvedValue({
      tasks: [{ ...mockTask, status: 2 }],
      hasMore: false,
    } as never);
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(makeGET("/api/tasks", { filter: "completed" }));
    expect(res.status).toBe(200);
    expectNoHttpCaching(res);
  });
});

describe("GET /api/tasks — 响应结构不回归（C2）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserFromRequest).mockResolvedValue(TEST_USER);
    vi.mocked(initDb).mockResolvedValue(undefined);
  });

  it("默认分支返回 200 + Task[] JSON 数组", async () => {
    vi.mocked(getTasks).mockResolvedValue([mockTask as never]);
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(makeGET("/api/tasks"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("task-1");
    expect(body[0].title).toBe("Test task");
  });

  it("filter=completed 保留 X-Has-More 头（hasMore=true → 'true'）", async () => {
    vi.mocked(getCompletedTasks).mockResolvedValue({
      tasks: [{ ...mockTask, status: 2 }],
      hasMore: true,
    } as never);
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(makeGET("/api/tasks", { filter: "completed" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Has-More")).toBe("true");
  });

  it("filter=completed 保留 X-Has-More 头（hasMore=false → 'false'）", async () => {
    vi.mocked(getCompletedTasks).mockResolvedValue({
      tasks: [],
      hasMore: false,
    } as never);
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(makeGET("/api/tasks", { filter: "completed" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Has-More")).toBe("false");
  });

  it("未认证返回 401 + { error }", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(makeGET("/api/tasks"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
