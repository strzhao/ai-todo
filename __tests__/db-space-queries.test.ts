import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery, mockTaggedTemplate } = vi.hoisted(() => {
  const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
  const mockTaggedTemplate = vi.fn().mockReturnValue({ rows: [] });
  Object.assign(mockTaggedTemplate, { query: mockQuery });
  return { mockQuery, mockTaggedTemplate };
});

vi.mock("@vercel/postgres", () => ({
  sql: mockTaggedTemplate,
}));

import { getTasks, getTodayTasks, getCompletedTasks } from "@/lib/db";

function makeRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    user_id: "user1",
    title: `Task ${id}`,
    description: null,
    due_date: null,
    start_date: null,
    end_date: null,
    priority: 2,
    status: 0,
    tags: [],
    sort_order: 0,
    created_at: new Date("2026-01-01"),
    completed_at: null,
    space_id: null,
    assignee_id: null,
    assignee_email: null,
    mentioned_emails: [],
    progress: 0,
    parent_id: null,
    pinned: false,
    invite_code: null,
    invite_mode: null,
    member_count: null,
    task_count: null,
    my_role: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTaggedTemplate.mockReturnValue({ rows: [] });
});

describe("getTasks with spaceId", () => {
  it("使用 space_id 索引直接查询（非递归 CTE）", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeRow("t1"), makeRow("t2")],
    });

    const result = await getTasks("user1", { spaceId: "space1" });

    expect(mockQuery).toHaveBeenCalledOnce();
    const sqlText = mockQuery.mock.calls[0][0] as string;
    expect(sqlText).toContain("space_id = $1");
    expect(sqlText).not.toContain("WITH RECURSIVE");
    expect(mockQuery.mock.calls[0][1]).toEqual(["space1"]);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("t1");
  });

  it("无 spaceId 时使用 sql 模板标签查询", async () => {
    mockTaggedTemplate.mockReturnValueOnce({
      rows: [makeRow("t1")],
    });

    const result = await getTasks("user1");

    expect(mockQuery).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });
});

describe("getCompletedTasks with spaceId", () => {
  it("使用 space_id 索引直接查询（非递归 CTE）", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeRow("t1", { status: 2, completed_at: new Date() })],
    });

    const result = await getCompletedTasks("user1", "space1");

    expect(mockQuery).toHaveBeenCalledOnce();
    const sqlText = mockQuery.mock.calls[0][0] as string;
    expect(sqlText).toContain("space_id = $1");
    expect(sqlText).not.toContain("WITH RECURSIVE");
    expect(sqlText).toContain("status = 2");
    expect(result).toHaveLength(1);
  });

  it("无 spaceId 时使用 sql 模板标签查询", async () => {
    mockTaggedTemplate.mockReturnValueOnce({ rows: [] });

    await getCompletedTasks("user1");

    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("getTodayTasks with spaceId", () => {
  it("使用 space_id 索引直接查询（非递归 CTE）", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getTodayTasks("user1", "space1");

    expect(mockQuery).toHaveBeenCalledOnce();
    const sqlText = mockQuery.mock.calls[0][0] as string;
    expect(sqlText).toContain("space_id = $1");
    expect(sqlText).not.toContain("WITH RECURSIVE");
    expect(sqlText).toContain("due_date");
  });

  it("无 spaceId 时使用 sql 模板标签查询", async () => {
    mockTaggedTemplate.mockReturnValueOnce({ rows: [] });

    await getTodayTasks("user1");

    expect(mockQuery).not.toHaveBeenCalled();
  });
});
