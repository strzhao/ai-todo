/**
 * GET /api/tasks/[id]/children — 验收测试
 *
 * 验收标准：
 * AC-1: 未认证请求返回 401
 * AC-2: 父任务不存在（或无权限）返回 404
 * AC-3: 默认返回直接子任务（树形结构），仅包含未完成任务
 * AC-4: recursive=true 时返回所有后代任务
 * AC-5: 子任务为空时返回空数组
 * AC-6: 返回结果使用 buildTree 组装为树形结构（子任务嵌套在 subtasks 字段）
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
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

// ── mock db ───────────────────────────────────────────────────────────────────

const mockGetTaskForUser = vi.fn();
const mockGetChildTasks = vi.fn();
const mockGetDescendantTasks = vi.fn();

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    initDb: vi.fn().mockResolvedValue(undefined),
    getTaskForUser: (...args: unknown[]) => mockGetTaskForUser(...args),
    getChildTasks: (...args: unknown[]) => mockGetChildTasks(...args),
    getDescendantTasks: (...args: unknown[]) => mockGetDescendantTasks(...args),
  };
});

// ── 测试常量 ──────────────────────────────────────────────────────────────────

const USER_ID = "user-001";
const USER_EMAIL = "user@example.com";
const PARENT_ID = "parent-task-001";

function makeTask(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    user_id: USER_ID,
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
    parent_id: PARENT_ID,
    pinned: false,
    invite_code: null,
    invite_mode: null,
    member_count: null,
    task_count: null,
    my_role: null,
    type: 0,
    ...overrides,
  };
}

function makeRequest(parentId: string, params: Record<string, string> = {}) {
  const url = new URL(`https://ai-todo.stringzhao.life/api/tasks/${parentId}/children`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserFromRequest.mockResolvedValue({ id: USER_ID, email: USER_EMAIL });
  mockGetTaskForUser.mockResolvedValue(makeTask(PARENT_ID, { parent_id: null }));
  mockGetChildTasks.mockResolvedValue([]);
  mockGetDescendantTasks.mockResolvedValue([]);
});

// ── AC-1: 未认证 ──────────────────────────────────────────────────────────────

describe("AC-1: 未认证请求", () => {
  it("返回 401", async () => {
    mockGetUserFromRequest.mockResolvedValueOnce(null);

    const { GET } = await import("@/app/api/tasks/[id]/children/route");
    const res = await GET(makeRequest(PARENT_ID), { params: Promise.resolve({ id: PARENT_ID }) });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ── AC-2: 父任务不存在或无权限 ───────────────────────────────────────────────

describe("AC-2: 父任务不存在或无权限", () => {
  it("返回 404", async () => {
    mockGetTaskForUser.mockResolvedValueOnce(null);

    const { GET } = await import("@/app/api/tasks/[id]/children/route");
    const res = await GET(makeRequest(PARENT_ID), { params: Promise.resolve({ id: PARENT_ID }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ── AC-3: 默认返回直接子任务（未完成） ───────────────────────────────────────

describe("AC-3: 默认返回直接未完成子任务", () => {
  it("调用 getChildTasks 而非 getDescendantTasks", async () => {
    mockGetChildTasks.mockResolvedValueOnce([makeTask("child-1"), makeTask("child-2")]);

    const { GET } = await import("@/app/api/tasks/[id]/children/route");
    await GET(makeRequest(PARENT_ID), { params: Promise.resolve({ id: PARENT_ID }) });

    expect(mockGetChildTasks).toHaveBeenCalledOnce();
    expect(mockGetChildTasks).toHaveBeenCalledWith(PARENT_ID);
    expect(mockGetDescendantTasks).not.toHaveBeenCalled();
  });

  it("返回 200 和子任务数组", async () => {
    mockGetChildTasks.mockResolvedValueOnce([makeTask("child-1"), makeTask("child-2")]);

    const { GET } = await import("@/app/api/tasks/[id]/children/route");
    const res = await GET(makeRequest(PARENT_ID), { params: Promise.resolve({ id: PARENT_ID }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
  });
});

// ── AC-4: recursive=true 时返回所有后代任务 ──────────────────────────────────

describe("AC-4: recursive=true 返回所有后代任务", () => {
  it("调用 getDescendantTasks 而非 getChildTasks", async () => {
    mockGetDescendantTasks.mockResolvedValueOnce([
      makeTask("child-1"),
      makeTask("grandchild-1", { parent_id: "child-1" }),
    ]);

    const { GET } = await import("@/app/api/tasks/[id]/children/route");
    await GET(makeRequest(PARENT_ID, { recursive: "true" }), {
      params: Promise.resolve({ id: PARENT_ID }),
    });

    expect(mockGetDescendantTasks).toHaveBeenCalledOnce();
    expect(mockGetDescendantTasks).toHaveBeenCalledWith(PARENT_ID);
    expect(mockGetChildTasks).not.toHaveBeenCalled();
  });

  it("返回后代任务列表", async () => {
    mockGetDescendantTasks.mockResolvedValueOnce([
      makeTask("child-1"),
      makeTask("grandchild-1", { parent_id: "child-1" }),
    ]);

    const { GET } = await import("@/app/api/tasks/[id]/children/route");
    const res = await GET(makeRequest(PARENT_ID, { recursive: "true" }), {
      params: Promise.resolve({ id: PARENT_ID }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

// ── AC-5: 无子任务时返回空数组 ───────────────────────────────────────────────

describe("AC-5: 无子任务时返回空数组", () => {
  it("返回 200 和空数组", async () => {
    mockGetChildTasks.mockResolvedValueOnce([]);

    const { GET } = await import("@/app/api/tasks/[id]/children/route");
    const res = await GET(makeRequest(PARENT_ID), { params: Promise.resolve({ id: PARENT_ID }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });
});

// ── AC-6: 返回树形结构（subtasks 嵌套） ──────────────────────────────────────

describe("AC-6: 返回 buildTree 组装的树形结构", () => {
  it("子任务嵌套在父节点的 subtasks 字段中", async () => {
    // recursive=true，child-1 有一个孙任务
    mockGetDescendantTasks.mockResolvedValueOnce([
      makeTask("child-1", { parent_id: PARENT_ID }),
      makeTask("grandchild-1", { parent_id: "child-1" }),
    ]);

    const { GET } = await import("@/app/api/tasks/[id]/children/route");
    const res = await GET(makeRequest(PARENT_ID, { recursive: "true" }), {
      params: Promise.resolve({ id: PARENT_ID }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    // 顶层只有 child-1
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("child-1");
    // grandchild-1 嵌套在 subtasks 里
    expect(Array.isArray(body[0].subtasks)).toBe(true);
    expect(body[0].subtasks).toHaveLength(1);
    expect(body[0].subtasks[0].id).toBe("grandchild-1");
  });
});
