/**
 * API Route acceptance test: GET/PATCH/DELETE /api/tasks/[id]
 *
 * Verifies:
 * - 401 when not authenticated (all methods)
 * - GET: 404 when not found, 200 with task
 * - PATCH: complete, reopen, pin, update, 403 permission error, 404 not found
 * - DELETE: 204 success, 403 permission error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeGET, makePATCH, makeDELETE, makeRouteContext } from "../helpers/make-request";
import { TaskPermissionError } from "@/lib/task-permissions";

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
vi.mock("@vercel/postgres", () => ({
  sql: Object.assign(vi.fn(), { query: vi.fn() }),
}));

import { getUserFromRequest } from "@/lib/auth";
import {
  initDb,
  completeTask,
  reopenTask,
  deleteTask,
  updateTask,
  pinTask,
  getTaskForUser,
} from "@/lib/db";

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
  pinned: false,
  tags: [],
  assignee_id: null,
};

describe("GET /api/tasks/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserFromRequest).mockResolvedValue({ id: "user-1", email: "test@example.com" });
    vi.mocked(initDb).mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    const { GET } = await import("@/app/api/tasks/[id]/route");
    const res = await GET(makeGET("/api/tasks/task-1"), makeRouteContext({ id: "task-1" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when task not found", async () => {
    vi.mocked(getTaskForUser).mockResolvedValue(null);
    const { GET } = await import("@/app/api/tasks/[id]/route");
    const res = await GET(makeGET("/api/tasks/nonexistent"), makeRouteContext({ id: "nonexistent" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Not found" });
  });

  it("returns 200 with task when found", async () => {
    vi.mocked(getTaskForUser).mockResolvedValue(mockTask as never);
    const { GET } = await import("@/app/api/tasks/[id]/route");
    const res = await GET(makeGET("/api/tasks/task-1"), makeRouteContext({ id: "task-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("task-1");
    expect(body.title).toBe("Test task");
  });

  it("exports preferredRegion as hkg1", async () => {
    const mod = await import("@/app/api/tasks/[id]/route");
    expect(mod.preferredRegion).toBe("hkg1");
  });
});

describe("PATCH /api/tasks/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserFromRequest).mockResolvedValue({ id: "user-1", email: "test@example.com" });
    vi.mocked(initDb).mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(
      makePATCH("/api/tasks/task-1", { title: "updated" }),
      makeRouteContext({ id: "task-1" })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 200 with completed task when complete=true", async () => {
    const completedTask = { ...mockTask, status: 2, completed_at: "2026-01-01T12:00:00Z" };
    vi.mocked(getTaskForUser).mockResolvedValue(mockTask as never);
    vi.mocked(completeTask).mockResolvedValue(completedTask as never);
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(
      makePATCH("/api/tasks/task-1", { complete: true }),
      makeRouteContext({ id: "task-1" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe(2);
  });

  it("returns 200 with reopened task when reopen=true", async () => {
    const reopenedTask = { ...mockTask, status: 0, completed_at: null };
    vi.mocked(reopenTask).mockResolvedValue(reopenedTask as never);
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(
      makePATCH("/api/tasks/task-1", { reopen: true }),
      makeRouteContext({ id: "task-1" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe(0);
  });

  it("returns 200 with pinned task when action=pin", async () => {
    const pinnedTask = { ...mockTask, pinned: true, invite_code: "abc12345" };
    vi.mocked(pinTask).mockResolvedValue(pinnedTask as never);
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(
      makePATCH("/api/tasks/task-1", { action: "pin" }),
      makeRouteContext({ id: "task-1" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pinned).toBe(true);
  });

  it("returns 200 with updated task for normal update", async () => {
    const updatedTask = { ...mockTask, title: "Updated title" };
    vi.mocked(getTaskForUser).mockResolvedValue(mockTask as never);
    vi.mocked(updateTask).mockResolvedValue(updatedTask as never);
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(
      makePATCH("/api/tasks/task-1", { title: "Updated title" }),
      makeRouteContext({ id: "task-1" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Updated title");
  });

  it("returns 403 when permission denied (TaskPermissionError)", async () => {
    vi.mocked(getTaskForUser).mockResolvedValue(mockTask as never);
    vi.mocked(updateTask).mockRejectedValue(new TaskPermissionError("No permission to edit"));
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(
      makePATCH("/api/tasks/task-1", { title: "hack" }),
      makeRouteContext({ id: "task-1" })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 404 when task not found during update", async () => {
    vi.mocked(getTaskForUser).mockResolvedValue(mockTask as never);
    vi.mocked(updateTask).mockResolvedValue(null as never);
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(
      makePATCH("/api/tasks/task-1", { title: "Updated" }),
      makeRouteContext({ id: "task-1" })
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Not found" });
  });

  it("returns 404 when completeTask throws 'Task not found'", async () => {
    vi.mocked(getTaskForUser).mockResolvedValue(mockTask as never);
    vi.mocked(completeTask).mockRejectedValue(new Error("Task not found"));
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(
      makePATCH("/api/tasks/task-1", { complete: true }),
      makeRouteContext({ id: "task-1" })
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Not found" });
  });
});

describe("DELETE /api/tasks/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserFromRequest).mockResolvedValue({ id: "user-1", email: "test@example.com" });
    vi.mocked(initDb).mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    const { DELETE } = await import("@/app/api/tasks/[id]/route");
    const res = await DELETE(makeDELETE("/api/tasks/task-1"), makeRouteContext({ id: "task-1" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 204 on successful deletion", async () => {
    vi.mocked(getTaskForUser).mockResolvedValue(mockTask as never);
    vi.mocked(deleteTask).mockResolvedValue(undefined);
    const { DELETE } = await import("@/app/api/tasks/[id]/route");
    const res = await DELETE(makeDELETE("/api/tasks/task-1"), makeRouteContext({ id: "task-1" }));
    expect(res.status).toBe(204);
  });

  it("returns 403 when permission denied (TaskPermissionError)", async () => {
    vi.mocked(getTaskForUser).mockResolvedValue(mockTask as never);
    vi.mocked(deleteTask).mockRejectedValue(new TaskPermissionError("No permission to delete"));
    const { DELETE } = await import("@/app/api/tasks/[id]/route");
    const res = await DELETE(makeDELETE("/api/tasks/task-1"), makeRouteContext({ id: "task-1" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
