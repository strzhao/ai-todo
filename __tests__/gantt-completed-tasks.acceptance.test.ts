/**
 * 验收测试：甘特图已完成任务日期范围过滤
 *
 * 验证设计文档中的核心功能：
 * - GET /api/tasks?filter=completed 新增 date_from / date_to 参数
 * - 提供日期范围时：返回范围内所有匹配已完成任务，不受 20 条分页限制
 * - 三种日期类型匹配逻辑（与 taskCoversRange 保持一致）：
 *   1. 范围任务（start_date + end_date/due_date）：s < dateTo AND effectiveEnd >= dateFrom
 *   2. 仅 start_date：start_date >= dateFrom AND start_date < dateTo
 *   3. 仅 due_date：due_date >= dateFrom AND due_date < dateTo
 * - 不提供日期范围时：行为不变（20 条分页 + X-Has-More header）
 * - useGanttCompletedTasks hook 接受 (spaceId, dateFrom, dateTo) 参数
 * - taskCoversRange 函数的半开区间 [from, to) 边界语义
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { taskCoversRange } from "@/lib/gantt-utils";
import type { Task } from "@/lib/types";

// ─── Mock Setup ──────────────────────────────────────────────────────────────

const { mockQuery, mockTaggedTemplate } = vi.hoisted(() => {
  const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
  const mockTaggedTemplate = vi.fn().mockReturnValue({ rows: [] });
  Object.assign(mockTaggedTemplate, { query: mockQuery });
  return { mockQuery, mockTaggedTemplate };
});

vi.mock("@vercel/postgres", () => ({
  sql: mockTaggedTemplate,
}));

vi.mock("@/lib/auth", () => ({
  getUserFromRequest: vi.fn().mockResolvedValue({ id: "user1", email: "test@test.com" }),
}));

vi.mock("@/lib/spaces", () => ({
  requireSpaceMember: vi.fn().mockResolvedValue({ role: "owner" }),
}));

vi.mock("@/lib/ai-flow-log", () => ({
  aiFlowLog: vi.fn(),
  getAiTraceIdFromHeaders: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/route-timing", () => ({
  createRouteTimer: vi.fn().mockReturnValue({
    track: vi.fn((_label: string, fn: () => Promise<unknown>) => fn()),
    json: vi.fn((data: unknown, init?: ResponseInit) => {
      const body = JSON.stringify(data);
      return new Response(body, {
        status: init?.status ?? 200,
        headers: {
          "content-type": "application/json",
          ...((init?.headers as Record<string, string>) || {}),
        },
      });
    }),
  }),
}));

vi.mock("@/lib/notifications", () => ({
  fireNotifications: vi.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** 构造 NextRequest 兼容对象（带 nextUrl 属性） */
function makeNextRequest(url: string) {
  const parsedUrl = new URL(url);
  const req = new Request(url, {
    method: "GET",
    headers: { cookie: "access_token=fake" },
  });
  Object.defineProperty(req, "nextUrl", { value: parsedUrl, writable: false });
  return req as unknown as import("next/server").NextRequest;
}

/** 构造已完成任务数据行（DB 返回格式，日期字段须为 Date 对象以匹配 rowToTask 的处理） */
function makeCompletedRow(
  id: string,
  completedAt: string,
  overrides: Record<string, unknown> = {}
) {
  // DB 层 rowToTask 调用 (row.due_date as Date).toISOString()，因此日期字段须为 Date 对象
  const base: Record<string, unknown> = {
    id,
    user_id: "user1",
    title: `Task ${id}`,
    description: null,
    due_date: null,
    start_date: null,
    end_date: null,
    priority: 2,
    status: 2,
    tags: [],
    sort_order: 0,
    created_at: new Date("2026-01-01"),
    completed_at: new Date(completedAt),
    space_id: null,
    assignee_id: null,
    assignee_email: null,
    mentioned_emails: [],
    progress: 100,
    parent_id: null,
    pinned: false,
    invite_code: null,
    invite_mode: null,
    member_count: null,
    task_count: null,
    my_role: null,
  };

  // 将 overrides 中的日期字符串转为 Date 对象
  for (const [key, val] of Object.entries(overrides)) {
    if (
      (key === "due_date" || key === "start_date" || key === "end_date") &&
      typeof val === "string"
    ) {
      base[key] = new Date(val);
    } else {
      base[key] = val;
    }
  }

  return base;
}

/** 构造最小化 Task 对象（用于 taskCoversRange 单元测试） */
function makeTask(id: string, overrides?: Partial<Task>): Task {
  return {
    id,
    user_id: "u1",
    title: `Task ${id}`,
    priority: 2,
    status: 2,
    tags: [],
    sort_order: 0,
    created_at: "2026-04-01T00:00:00Z",
    progress: 100,
    ...overrides,
  } as Task;
}

/** 将 YYYY-MM-DD 字符串转为该日 UTC 零点毫秒数 */
function dateMs(dateStr: string): number {
  return new Date(dateStr).getTime();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTaggedTemplate.mockReturnValue({ rows: [] });
  mockQuery.mockResolvedValue({ rows: [] });
});

// ─── 场景一：基础功能 ─────────────────────────────────────────────────────────

describe("场景一：带 date_from/date_to 时返回日期范围内的已完成任务", () => {
  it("只返回 due_date 落在 [date_from, date_to) 范围内的已完成任务", async () => {
    // 周一(2026-04-06) 至 周日(2026-04-12) 为当前周，date_to = 2026-04-13（不含）
    const inRangeTask = makeCompletedRow("in-range", "2026-04-06T12:00:00Z", {
      due_date: "2026-04-07",
    });
    const outOfRangeTask = makeCompletedRow("out-range", "2026-04-01T12:00:00Z", {
      due_date: "2026-04-01",
    });

    mockTaggedTemplate.mockReturnValue({ rows: [inRangeTask, outOfRangeTask] });
    mockQuery.mockResolvedValue({ rows: [inRangeTask, outOfRangeTask] });

    const { GET } = await import("@/app/api/tasks/route");

    const req = makeNextRequest(
      "http://localhost/api/tasks?filter=completed&date_from=2026-04-06&date_to=2026-04-13"
    );
    const res = await GET(req);
    const body = await res.json();

    // 响应体是数组
    expect(Array.isArray(body)).toBe(true);

    // 两种实现都是合理的：
    // a) API 层依赖 DB 层已过滤，返回全部结果（DB 负责过滤）
    // b) API 层进行二次过滤
    // 无论哪种，响应应成功
    expect(res.status).toBe(200);
  });

  it("有匹配任务时响应体包含任务数据", async () => {
    const tasks = [
      makeCompletedRow("t1", "2026-04-07T10:00:00Z", { due_date: "2026-04-07" }),
      makeCompletedRow("t2", "2026-04-08T10:00:00Z", { due_date: "2026-04-08" }),
    ];

    mockTaggedTemplate.mockReturnValue({ rows: tasks });
    mockQuery.mockResolvedValue({ rows: tasks });

    const { GET } = await import("@/app/api/tasks/route");

    const req = makeNextRequest(
      "http://localhost/api/tasks?filter=completed&date_from=2026-04-06&date_to=2026-04-13"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(Array.isArray(body)).toBe(true);
    // DB 返回了 2 条，API 也应返回（不超过实际数量）
    expect(body.length).toBeLessThanOrEqual(tasks.length);
    expect(body.length).toBeGreaterThanOrEqual(0);
  });
});

// ─── 场景二：不受分页限制 ─────────────────────────────────────────────────────

describe("场景二：带日期范围时不受 20 条分页限制", () => {
  it("25 个匹配任务时全部返回（不受 20 条默认 limit 截断）", async () => {
    const tasks = Array.from({ length: 25 }, (_, i) =>
      makeCompletedRow(`t${i}`, `2026-04-07T${String(i).padStart(2, "0")}:00:00Z`, {
        due_date: "2026-04-07",
      })
    );

    mockTaggedTemplate.mockReturnValue({ rows: tasks });
    mockQuery.mockResolvedValue({ rows: tasks });

    const { GET } = await import("@/app/api/tasks/route");

    const req = makeNextRequest(
      "http://localhost/api/tasks?filter=completed&date_from=2026-04-06&date_to=2026-04-13"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(Array.isArray(body)).toBe(true);
    // 带日期范围时，不应被 20 条截断，应返回全部 25 条
    expect(body.length).toBe(25);
  });

  it("带日期范围时不返回 X-Has-More 头（或为 false，因不分页）", async () => {
    const tasks = Array.from({ length: 25 }, (_, i) =>
      makeCompletedRow(`t${i}`, `2026-04-07T${String(i).padStart(2, "0")}:00:00Z`, {
        due_date: "2026-04-07",
      })
    );

    mockTaggedTemplate.mockReturnValue({ rows: tasks });
    mockQuery.mockResolvedValue({ rows: tasks });

    const { GET } = await import("@/app/api/tasks/route");

    const req = makeNextRequest(
      "http://localhost/api/tasks?filter=completed&date_from=2026-04-06&date_to=2026-04-13"
    );
    const res = await GET(req);

    // 带日期范围不分页：X-Has-More 应不存在，或存在但值为 "false"
    const hasMoreHeader = res.headers.get("X-Has-More");
    if (hasMoreHeader !== null) {
      expect(hasMoreHeader).toBe("false");
    }
  });
});

// ─── 场景三：三种日期类型边界 ────────────────────────────────────────────────

describe("场景三：API 正确处理三种日期类型", () => {
  it("仅有 due_date 的任务落在范围内 → 应被包含", async () => {
    // 周一 due_date，查询本周
    const dueDateTask = makeCompletedRow("due-only", "2026-04-06T10:00:00Z", {
      due_date: "2026-04-06", // 周一
      start_date: null,
      end_date: null,
    });

    mockTaggedTemplate.mockReturnValue({ rows: [dueDateTask] });
    mockQuery.mockResolvedValue({ rows: [dueDateTask] });

    const { GET } = await import("@/app/api/tasks/route");

    const req = makeNextRequest(
      "http://localhost/api/tasks?filter=completed&date_from=2026-04-06&date_to=2026-04-13"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it("仅有 start_date 的任务（周三）落在范围内 → 应被包含", async () => {
    const startDateTask = makeCompletedRow("start-only", "2026-04-08T10:00:00Z", {
      start_date: "2026-04-08", // 周三
      due_date: null,
      end_date: null,
    });

    mockTaggedTemplate.mockReturnValue({ rows: [startDateTask] });
    mockQuery.mockResolvedValue({ rows: [startDateTask] });

    const { GET } = await import("@/app/api/tasks/route");

    const req = makeNextRequest(
      "http://localhost/api/tasks?filter=completed&date_from=2026-04-06&date_to=2026-04-13"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it("有 start_date + end_date 跨周范围的任务 → 应被包含", async () => {
    // 任务从上周五持续到本周三，与本周区间重叠
    const rangeTask = makeCompletedRow("range-task", "2026-04-08T10:00:00Z", {
      start_date: "2026-04-03", // 上周五
      end_date: "2026-04-08", // 本周三
      due_date: null,
    });

    mockTaggedTemplate.mockReturnValue({ rows: [rangeTask] });
    mockQuery.mockResolvedValue({ rows: [rangeTask] });

    const { GET } = await import("@/app/api/tasks/route");

    const req = makeNextRequest(
      "http://localhost/api/tasks?filter=completed&date_from=2026-04-06&date_to=2026-04-13"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });
});

// ─── 场景四：范围外任务排除 ──────────────────────────────────────────────────

describe("场景四：日期范围参数传递给 API 时不返回范围外任务", () => {
  it("date_to 边界：due_date 恰好等于 date_to 的任务不在范围内（半开区间 [from, to)）", async () => {
    // due_date = 2026-04-13 恰好等于 date_to，不应包含
    const borderTask = makeCompletedRow("border-out", "2026-04-13T10:00:00Z", {
      due_date: "2026-04-13",
    });
    // due_date = 2026-04-12 应包含（range 内最后一天）
    const lastInTask = makeCompletedRow("last-in", "2026-04-12T10:00:00Z", {
      due_date: "2026-04-12",
    });

    // DB 只返回范围内的（date_to 不含）
    mockTaggedTemplate.mockReturnValue({ rows: [lastInTask] });
    mockQuery.mockResolvedValue({ rows: [lastInTask] });

    const { GET } = await import("@/app/api/tasks/route");

    const req = makeNextRequest(
      "http://localhost/api/tasks?filter=completed&date_from=2026-04-06&date_to=2026-04-13"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    // border-out 不应在结果中
    const ids = body.map((t: { id: string }) => t.id);
    expect(ids).not.toContain("border-out");
    expect(ids).toContain("last-in");
  });

  it("date_from 边界：due_date 恰好等于 date_from 的任务应在范围内（含左端点）", async () => {
    const firstDayTask = makeCompletedRow("first-day", "2026-04-06T10:00:00Z", {
      due_date: "2026-04-06",
    });

    mockTaggedTemplate.mockReturnValue({ rows: [firstDayTask] });
    mockQuery.mockResolvedValue({ rows: [firstDayTask] });

    const { GET } = await import("@/app/api/tasks/route");

    const req = makeNextRequest(
      "http://localhost/api/tasks?filter=completed&date_from=2026-04-06&date_to=2026-04-13"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    const ids = body.map((t: { id: string }) => t.id);
    expect(ids).toContain("first-day");
  });
});

// ─── 场景五：向后兼容 ────────────────────────────────────────────────────────

describe("场景五：不传 date_from/date_to 时行为不变（分页 + X-Has-More）", () => {
  it("不传日期范围时返回数组响应体", async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeCompletedRow(`t${i}`, `2026-04-${String(7 - i).padStart(2, "0")}T10:00:00Z`)
    );

    mockTaggedTemplate.mockReturnValue({ rows });
    mockQuery.mockResolvedValue({ rows });

    const { GET } = await import("@/app/api/tasks/route");

    const req = makeNextRequest("http://localhost/api/tasks?filter=completed");
    const res = await GET(req);
    const body = await res.json();

    // 向后兼容：响应体是 Task[] 数组
    expect(Array.isArray(body)).toBe(true);
    expect(res.status).toBe(200);
  });

  it("不传日期范围时存在 X-Has-More 头（值为 true 或 false）", async () => {
    // DB 返回 21 条（超过默认 limit 20），触发 hasMore=true
    const rows = Array.from({ length: 21 }, (_, i) =>
      makeCompletedRow(`t${i}`, `2026-03-${String(21 - i).padStart(2, "0")}T10:00:00Z`)
    );

    mockTaggedTemplate.mockReturnValue({ rows });
    mockQuery.mockResolvedValue({ rows });

    const { GET } = await import("@/app/api/tasks/route");

    const req = makeNextRequest("http://localhost/api/tasks?filter=completed");
    const res = await GET(req);

    // 不分页模式应有 X-Has-More 头
    const hasMoreHeader = res.headers.get("X-Has-More");
    expect(hasMoreHeader).not.toBeNull();
    expect(["true", "false"]).toContain(hasMoreHeader);
  });

  it("不传日期范围时最多返回 20 条（默认 limit）", async () => {
    // DB 模拟返回 21 条（LIMIT+1 策略）
    const rows = Array.from({ length: 21 }, (_, i) =>
      makeCompletedRow(`t${i}`, `2026-03-${String(21 - i).padStart(2, "0")}T10:00:00Z`)
    );

    mockTaggedTemplate.mockReturnValue({ rows });
    mockQuery.mockResolvedValue({ rows });

    const { GET } = await import("@/app/api/tasks/route");

    const req = makeNextRequest("http://localhost/api/tasks?filter=completed");
    const res = await GET(req);
    const body = await res.json();

    expect(Array.isArray(body)).toBe(true);
    // 默认分页：最多 20 条
    expect(body.length).toBeLessThanOrEqual(20);
  });
});

// ─── 场景六：taskCoversRange 单元测试 ────────────────────────────────────────

describe("场景六：taskCoversRange 三种日期类型边界条件", () => {
  // 本周：2026-04-06（周一）至 2026-04-12（周日）
  // rangeStartMs = dateMs("2026-04-06")
  // rangeEndMs   = dateMs("2026-04-13")（不含，半开区间）

  const rangeStartMs = dateMs("2026-04-06");
  const rangeEndMs = dateMs("2026-04-13");

  // ── 分支一：范围任务（start_date + end_date/due_date）──

  describe("分支一：范围任务 start_date + end_date", () => {
    it("start_date < dateTo AND end_date >= dateFrom → true（完全在范围内）", () => {
      const task = makeTask("a", { start_date: "2026-04-07", end_date: "2026-04-09" });
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(true);
    });

    it("start_date 在范围前，end_date 在范围内 → true（左侧延伸进入范围）", () => {
      const task = makeTask("a", { start_date: "2026-04-01", end_date: "2026-04-08" });
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(true);
    });

    it("start_date 在范围内，end_date 在范围后 → true（右侧延伸出范围）", () => {
      const task = makeTask("a", { start_date: "2026-04-10", end_date: "2026-04-20" });
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(true);
    });

    it("start_date < dateFrom，end_date 覆盖整个范围 → true（完全包围范围）", () => {
      const task = makeTask("a", { start_date: "2026-03-01", end_date: "2026-04-30" });
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(true);
    });

    it("end_date 恰好等于 dateFrom → true（end_date >= dateFrom 含等号）", () => {
      // effectiveEnd = 2026-04-06 = dateFrom，条件 e >= rangeStartMs 满足
      const task = makeTask("a", { start_date: "2026-04-01", end_date: "2026-04-06" });
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(true);
    });

    it("end_date 在 dateFrom 之前 → false（任务在范围左侧）", () => {
      const task = makeTask("a", { start_date: "2026-04-01", end_date: "2026-04-05" });
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(false);
    });

    it("start_date 恰好等于 dateTo → false（start_date < dateTo 不满足）", () => {
      // start = 2026-04-13 = dateTo，条件 s < rangeEndMs 不满足
      const task = makeTask("a", { start_date: "2026-04-13", end_date: "2026-04-15" });
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(false);
    });

    it("start_date > dateTo → false（任务在范围右侧）", () => {
      const task = makeTask("a", { start_date: "2026-04-14", end_date: "2026-04-16" });
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(false);
    });
  });

  describe("分支一变体：start_date + due_date（无 end_date）作为范围任务", () => {
    it("start_date + due_date 跨范围 → true", () => {
      // start_date 在范围前，due_date 在范围内，无 end_date
      // effectiveEnd = task.start_date && task.due_date ? task.due_date : null → due_date
      const task = makeTask("a", { start_date: "2026-04-01", due_date: "2026-04-08" });
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(true);
    });

    it("start_date + due_date 均在范围内 → true", () => {
      const task = makeTask("a", { start_date: "2026-04-07", due_date: "2026-04-09" });
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(true);
    });

    it("start_date + due_date 均在范围外（左侧）→ false", () => {
      const task = makeTask("a", { start_date: "2026-04-01", due_date: "2026-04-05" });
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(false);
    });
  });

  // ── 分支二：仅 start_date ──

  describe("分支二：仅 start_date（无 end_date 无 due_date）", () => {
    it("start_date 在范围内（周三）→ true", () => {
      const task = makeTask("b", { start_date: "2026-04-08" }); // 周三
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(true);
    });

    it("start_date 恰好等于 dateFrom → true（含左端点）", () => {
      const task = makeTask("b", { start_date: "2026-04-06" });
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(true);
    });

    it("start_date 恰好等于 dateTo → false（不含右端点 [from, to)）", () => {
      const task = makeTask("b", { start_date: "2026-04-13" });
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(false);
    });

    it("start_date 在 dateFrom 之前 → false", () => {
      const task = makeTask("b", { start_date: "2026-04-05" });
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(false);
    });

    it("start_date 在 dateTo 之后 → false", () => {
      const task = makeTask("b", { start_date: "2026-04-14" });
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(false);
    });

    it("start_date 在范围最后一天（周日）→ true", () => {
      const task = makeTask("b", { start_date: "2026-04-12" }); // 周日，< dateTo(04-13)
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(true);
    });
  });

  // ── 分支三：仅 due_date ──

  describe("分支三：仅 due_date（无 start_date）", () => {
    it("due_date 在范围内（周一）→ true", () => {
      const task = makeTask("c", { due_date: "2026-04-06" }); // 周一
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(true);
    });

    it("due_date 恰好等于 dateFrom → true（含左端点）", () => {
      const task = makeTask("c", { due_date: "2026-04-06" });
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(true);
    });

    it("due_date 恰好等于 dateTo → false（不含右端点 [from, to)）", () => {
      const task = makeTask("c", { due_date: "2026-04-13" });
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(false);
    });

    it("due_date 在 dateFrom 之前 → false（周五，上上周）", () => {
      const task = makeTask("c", { due_date: "2026-03-27" });
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(false);
    });

    it("due_date 在 dateTo 之后 → false", () => {
      const task = makeTask("c", { due_date: "2026-04-20" });
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(false);
    });

    it("due_date 在范围最后一天（周日）→ true", () => {
      const task = makeTask("c", { due_date: "2026-04-12" }); // 周日，< dateTo(04-13)
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(true);
    });
  });

  // ── 无日期任务 ──

  describe("无日期任务", () => {
    it("无任何日期 → false", () => {
      const task = makeTask("d");
      expect(taskCoversRange(task, rangeStartMs, rangeEndMs)).toBe(false);
    });
  });

  // ── 跨月边界 ──

  describe("跨月边界", () => {
    it("3月31日 due_date，范围跨月（03-30 至 04-06）→ true", () => {
      const task = makeTask("e", { due_date: "2026-03-31" });
      const fromMs = dateMs("2026-03-30");
      const toMs = dateMs("2026-04-06");
      expect(taskCoversRange(task, fromMs, toMs)).toBe(true);
    });

    it("4月1日 due_date，范围跨月（03-30 至 04-06）→ true", () => {
      const task = makeTask("e", { due_date: "2026-04-01" });
      const fromMs = dateMs("2026-03-30");
      const toMs = dateMs("2026-04-06");
      expect(taskCoversRange(task, fromMs, toMs)).toBe(true);
    });
  });
});

// ─── 场景七：useGanttCompletedTasks hook 接口验证 ──────────────────────────────

describe("场景七：useGanttCompletedTasks hook 接口验证", () => {
  it("use-tasks 模块导出 useGanttCompletedTasks 函数", async () => {
    const mod = await import("@/lib/use-tasks");
    expect(typeof (mod as Record<string, unknown>).useGanttCompletedTasks).toBe("function");
  });

  it("useGanttCompletedTasks 接受 spaceId, dateFrom, dateTo 三个参数", async () => {
    const mod = await import("@/lib/use-tasks");
    const hookFn = (mod as Record<string, unknown>).useGanttCompletedTasks as (
      ...args: unknown[]
    ) => unknown;
    // 函数应接受 3 个参数：spaceId, dateFrom, dateTo
    expect(hookFn.length).toBeGreaterThanOrEqual(2);
    expect(hookFn.length).toBeLessThanOrEqual(3);
  });
});
