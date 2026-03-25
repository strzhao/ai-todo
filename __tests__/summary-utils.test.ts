import { describe, it, expect } from "vitest";
import {
  allocateCharBudget,
  getActiveTaskIds,
  getAncestorIds,
  filterRecentLogs,
  truncateText,
  buildCompressedSpaceText,
  MAIN_SPACE_CHAR_LIMIT,
  LINKED_SPACES_TOTAL_CHAR_LIMIT,
  MIN_SPACE_CHAR_LIMIT,
} from "@/lib/summary-utils";
import type { Task, TaskLog } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    user_id: "u1",
    title: `Task ${overrides.id}`,
    priority: 2,
    status: 0,
    tags: [],
    sort_order: 0,
    created_at: "2026-03-15T00:00:00Z",
    progress: 0,
    ...overrides,
  } as Task;
}

function makeLog(overrides: Partial<TaskLog> & { task_id: string }): TaskLog {
  return {
    id: `log-${overrides.task_id}-${Math.random().toString(36).slice(2, 6)}`,
    user_id: "u1",
    user_email: "user@test.com",
    content: "Some progress",
    created_at: "2026-03-19T10:00:00Z",
    ...overrides,
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("should have expected values", () => {
    expect(MAIN_SPACE_CHAR_LIMIT).toBe(40000);
    expect(LINKED_SPACES_TOTAL_CHAR_LIMIT).toBe(15000);
    expect(MIN_SPACE_CHAR_LIMIT).toBe(2000);
  });
});

// ─── allocateCharBudget ───────────────────────────────────────────────────────

describe("allocateCharBudget", () => {
  it("returns 0 for 0 spaces", () => {
    expect(allocateCharBudget(15000, 0)).toBe(0);
  });

  it("returns 0 for negative space count", () => {
    expect(allocateCharBudget(15000, -1)).toBe(0);
  });

  it("returns full budget for 1 space", () => {
    expect(allocateCharBudget(15000, 1)).toBe(15000);
  });

  it("divides evenly for multiple spaces", () => {
    expect(allocateCharBudget(15000, 3)).toBe(5000);
  });

  it("floors when not evenly divisible", () => {
    expect(allocateCharBudget(15000, 7)).toBe(2142);
  });

  it("enforces minimum of 2000", () => {
    expect(allocateCharBudget(15000, 10)).toBe(MIN_SPACE_CHAR_LIMIT);
  });

  it("enforces minimum even with tiny budget", () => {
    expect(allocateCharBudget(100, 5)).toBe(MIN_SPACE_CHAR_LIMIT);
  });
});

// ─── getActiveTaskIds ─────────────────────────────────────────────────────────

describe("getActiveTaskIds", () => {
  const date = "2026-03-19";

  it("returns empty set with no tasks and no logs", () => {
    const result = getActiveTaskIds([], [], date);
    expect(result.size).toBe(0);
  });

  it("includes tasks with recent logs", () => {
    const tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2" })];
    const logs = [makeLog({ task_id: "t1", created_at: "2026-03-18T10:00:00Z" })];
    const result = getActiveTaskIds(tasks, logs, date);
    expect(result.has("t1")).toBe(true);
    expect(result.has("t2")).toBe(false);
  });

  it("excludes tasks with logs older than cutoff", () => {
    const tasks = [makeTask({ id: "t1" })];
    const logs = [makeLog({ task_id: "t1", created_at: "2026-03-10T10:00:00Z" })];
    const result = getActiveTaskIds(tasks, logs, date, 3);
    expect(result.has("t1")).toBe(false);
  });

  it("includes tasks completed today", () => {
    const tasks = [
      makeTask({ id: "t1", status: 2, completed_at: "2026-03-19T08:00:00Z" }),
      makeTask({ id: "t2", status: 2, completed_at: "2026-03-17T08:00:00Z" }),
    ];
    const result = getActiveTaskIds(tasks, [], date);
    expect(result.has("t1")).toBe(true);
    expect(result.has("t2")).toBe(false);
  });

  it("combines logs and completion", () => {
    const tasks = [
      makeTask({ id: "t1", status: 2, completed_at: "2026-03-19T08:00:00Z" }),
      makeTask({ id: "t2" }),
    ];
    const logs = [makeLog({ task_id: "t2", created_at: "2026-03-18T10:00:00Z" })];
    const result = getActiveTaskIds(tasks, logs, date);
    expect(result.has("t1")).toBe(true);
    expect(result.has("t2")).toBe(true);
  });
});

// ─── getAncestorIds ───────────────────────────────────────────────────────────

describe("getAncestorIds", () => {
  it("returns empty array for root task", () => {
    const tasks = [makeTask({ id: "root" })];
    expect(getAncestorIds("root", tasks)).toEqual([]);
  });

  it("returns parent chain", () => {
    const tasks = [
      makeTask({ id: "root" }),
      makeTask({ id: "child", parent_id: "root" }),
      makeTask({ id: "grandchild", parent_id: "child" }),
    ];
    expect(getAncestorIds("grandchild", tasks)).toEqual(["child", "root"]);
  });

  it("handles missing task gracefully", () => {
    const tasks = [makeTask({ id: "root" })];
    expect(getAncestorIds("nonexistent", tasks)).toEqual([]);
  });
});

// ─── filterRecentLogs ─────────────────────────────────────────────────────────

describe("filterRecentLogs", () => {
  const date = "2026-03-19";

  it("returns empty for no logs", () => {
    expect(filterRecentLogs([], date, 3, 3)).toEqual([]);
  });

  it("filters out old logs", () => {
    const logs = [
      makeLog({ task_id: "t1", created_at: "2026-03-19T10:00:00Z" }),
      makeLog({ task_id: "t1", created_at: "2026-03-10T10:00:00Z" }),
    ];
    const result = filterRecentLogs(logs, date, 3, 3);
    expect(result).toHaveLength(1);
  });

  it("limits per-task count", () => {
    const logs = [
      makeLog({ task_id: "t1", created_at: "2026-03-19T10:00:00Z", content: "a" }),
      makeLog({ task_id: "t1", created_at: "2026-03-19T09:00:00Z", content: "b" }),
      makeLog({ task_id: "t1", created_at: "2026-03-19T08:00:00Z", content: "c" }),
      makeLog({ task_id: "t1", created_at: "2026-03-19T07:00:00Z", content: "d" }),
    ];
    const result = filterRecentLogs(logs, date, 3, 2);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("a");
    expect(result[1].content).toBe("b");
  });

  it("sorts by descending date", () => {
    const logs = [
      makeLog({ task_id: "t1", created_at: "2026-03-17T10:00:00Z", content: "old" }),
      makeLog({ task_id: "t2", created_at: "2026-03-19T10:00:00Z", content: "new" }),
    ];
    const result = filterRecentLogs(logs, date, 3, 3);
    expect(result[0].content).toBe("new");
    expect(result[1].content).toBe("old");
  });
});

// ─── truncateText ─────────────────────────────────────────────────────────────

describe("truncateText", () => {
  it("returns text unchanged when under limit", () => {
    expect(truncateText("hello", 100)).toBe("hello");
  });

  it("returns text unchanged when exactly at limit", () => {
    const text = "a".repeat(100);
    expect(truncateText(text, 100)).toBe(text);
  });

  it("truncates and adds marker when over limit", () => {
    const text = "a".repeat(200);
    const result = truncateText(text, 100);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result).toContain("...(数据已截断)");
  });
});

// ─── buildCompressedSpaceText ─────────────────────────────────────────────────

describe("buildCompressedSpaceText", () => {
  const date = "2026-03-19";
  const nameMap = new Map([["user@test.com", "张三"]]);

  it("produces stats header", () => {
    const tasks = [
      makeTask({ id: "root", title: "项目A" }),
      makeTask({ id: "t1", parent_id: "root", status: 2, completed_at: "2026-03-19T08:00:00Z" }),
      makeTask({ id: "t2", parent_id: "root" }),
    ];
    const result = buildCompressedSpaceText("项目A", tasks, [], date, nameMap, 10000);
    expect(result).toContain("### 项目A");
    expect(result).toContain("共 3 任务");
    expect(result).toContain("1 完成");
    expect(result).toContain("今日完成 1");
  });

  it("collapses non-active tasks into summary line", () => {
    const tasks = [
      makeTask({ id: "root", title: "项目" }),
      makeTask({ id: "active", parent_id: "root", title: "活跃任务" }),
      makeTask({ id: "idle1", parent_id: "root", title: "闲置1" }),
      makeTask({ id: "idle2", parent_id: "root", title: "闲置2", status: 2, completed_at: "2026-03-10T00:00:00Z" }),
    ];
    const logs = [makeLog({ task_id: "active", created_at: "2026-03-19T10:00:00Z" })];

    const result = buildCompressedSpaceText("项目", tasks, logs, date, nameMap, 10000);
    expect(result).toContain("活跃任务");
    expect(result).toContain("[其他 2 个任务: 1 完成 / 1 进行中]");
    expect(result).not.toContain("闲置1");
    expect(result).not.toContain("闲置2");
  });

  it("includes ancestor chain of active tasks", () => {
    const tasks = [
      makeTask({ id: "root", title: "根" }),
      makeTask({ id: "parent", parent_id: "root", title: "父任务" }),
      makeTask({ id: "child", parent_id: "parent", title: "子任务" }),
      makeTask({ id: "idle", parent_id: "root", title: "闲置" }),
    ];
    const logs = [makeLog({ task_id: "child", created_at: "2026-03-19T10:00:00Z" })];

    const result = buildCompressedSpaceText("根", tasks, logs, date, nameMap, 10000);
    expect(result).toContain("父任务");
    expect(result).toContain("子任务");
    expect(result).not.toContain("闲置");
  });

  it("includes recent logs", () => {
    const tasks = [
      makeTask({ id: "root", title: "项目" }),
      makeTask({ id: "t1", parent_id: "root", title: "任务1" }),
    ];
    const logs = [
      makeLog({ task_id: "t1", created_at: "2026-03-19T10:00:00Z", content: "完成了接口开发" }),
    ];

    const result = buildCompressedSpaceText("项目", tasks, logs, date, nameMap, 10000);
    expect(result).toContain("进展日志:");
    expect(result).toContain("完成了接口开发");
    expect(result).toContain("张三");
  });

  it("truncates when exceeding maxChars", () => {
    const tasks = [makeTask({ id: "root", title: "项目" })];
    const result = buildCompressedSpaceText("项目", tasks, [], date, nameMap, 50);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result).toContain("...(数据已截断)");
  });

  it("handles empty tasks array", () => {
    const result = buildCompressedSpaceText("空项目", [], [], date, nameMap, 10000);
    expect(result).toContain("### 空项目");
    expect(result).toContain("共 0 任务");
  });
});
