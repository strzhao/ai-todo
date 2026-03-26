/**
 * API Route acceptance test: GET & POST /api/tasks
 *
 * Verifies:
 * - 401 when not authenticated (GET & POST)
 * - GET: 200 + Task[] for default/today/completed/type=1
 * - GET filter=completed: X-Has-More header
 * - POST: 400 when title missing, 400 when parent_id invalid, 403 when not space member, 201 on success
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeGET, makePOST } from "../helpers/make-request";

// Mock all external dependencies
vi.mock("@/lib/auth");
vi.mock("@/lib/db");
vi.mock("@/lib/route-timing", () => ({
  createRouteTimer: vi.fn().mockImplementation(() => ({
    track: vi.fn().mockImplementation((_name: string, fn: () => unknown) => fn()),
    json: vi.fn().mockImplementation((data: unknown, init?: ResponseInit) =>
      Response.json(data, init)
    ),
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
vi.mock("@vercel/postgres", () => ({
  sql: Object.assign(vi.fn(), { query: vi.fn() }),
}));

import { getUserFromRequest } from "@/lib/auth";
import { initDb, getTasks, getTodayTasks, getCompletedTasks, createTask, getTaskById } from "@/lib/db";
import { requireSpaceMember } from "@/lib/spaces";

const mockTask = {
  id: "task-1",
  title: "Test task",
  status: 0,
  priority: 2,
  type: 0,
  user_id: "user-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  parent_id: null,
  space_id: null,
  tags: [],
};

describe("GET /api/tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserFromRequest).mockResolvedValue({ id: "user-1", email: "test@example.com" });
    vi.mocked(initDb).mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(makeGET("/api/tasks"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 200 with task list for default query", async () => {
    vi.mocked(getTasks).mockResolvedValue([mockTask as never]);
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(makeGET("/api/tasks"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("task-1");
  });

  it("returns 200 with today tasks when filter=today", async () => {
    vi.mocked(getTodayTasks).mockResolvedValue([mockTask as never]);
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(makeGET("/api/tasks", { filter: "today" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("returns 200 with completed tasks and X-Has-More header when filter=completed", async () => {
    vi.mocked(getCompletedTasks).mockResolvedValue({
      tasks: [{ ...mockTask, status: 2 }],
      hasMore: true,
    } as never);
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(makeGET("/api/tasks", { filter: "completed" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Has-More")).toBe("true");
  });

  it("returns 200 with notes when type=1", async () => {
    const noteTask = { ...mockTask, type: 1 };
    vi.mocked(getTasks).mockResolvedValue([noteTask as never]);
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(makeGET("/api/tasks", { type: "1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("returns 403 when space_id provided but user is not a member", async () => {
    vi.mocked(requireSpaceMember).mockRejectedValue(new Error("Not a member"));
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(makeGET("/api/tasks", { space_id: "space-1" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Not a space member" });
  });

  it("exports preferredRegion as hkg1", async () => {
    const mod = await import("@/app/api/tasks/route");
    expect(mod.preferredRegion).toBe("hkg1");
  });
});

describe("POST /api/tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserFromRequest).mockResolvedValue({ id: "user-1", email: "test@example.com" });
    vi.mocked(initDb).mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(makePOST("/api/tasks", { title: "test" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when title is missing", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(makePOST("/api/tasks", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when title is empty string", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(makePOST("/api/tasks", { title: "   " }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when parent_id points to non-existent task", async () => {
    vi.mocked(getTaskById).mockResolvedValue(null);
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(makePOST("/api/tasks", { title: "child", parent_id: "nonexistent" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Parent task not found" });
  });

  it("returns 403 when space_id provided but user is not a member", async () => {
    vi.mocked(requireSpaceMember).mockRejectedValue(new Error("Not a member"));
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(makePOST("/api/tasks", { title: "test", space_id: "space-1" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Not a space member" });
  });

  it("returns 201 with created task on success", async () => {
    vi.mocked(createTask).mockResolvedValue(mockTask as never);
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(makePOST("/api/tasks", { title: "New task" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("task-1");
    expect(body.title).toBe("Test task");
    expect(body.status).toBe(0);
  });

  it("auto-inherits space_id from parent when parent is pinned", async () => {
    const pinnedParent = { ...mockTask, id: "parent-1", pinned: true, space_id: null };
    vi.mocked(getTaskById).mockResolvedValue(pinnedParent as never);
    vi.mocked(requireSpaceMember).mockResolvedValue({ id: "m-1", task_id: "parent-1", user_id: "user-1", email: "test@example.com", role: "member", status: "active", joined_at: "2026-01-01T00:00:00Z" });
    vi.mocked(createTask).mockResolvedValue({ ...mockTask, space_id: "parent-1" } as never);
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(makePOST("/api/tasks", { title: "child", parent_id: "parent-1" }));
    expect(res.status).toBe(201);
  });
});
