/**
 * API Route acceptance test: 空间层守卫对 admin 拒绝（方案 B 边界验证）
 *
 * 方案 B 给 space_admin 放开了任务级权限（对齐 owner），但空间层面的转让/解散
 * 必须仍仅限 owner。本测试验证 admin 调用空间 PATCH（改空间元信息）和
 * DELETE（解散空间）仍返回 403，确认任务权限矩阵的扩大不会泄露到空间层。
 *
 * 覆盖：
 * - admin PATCH /api/spaces/[id] → 403（Only owner can update space）
 * - admin DELETE /api/spaces/[id] → 403（Only owner can delete space）
 * - owner PATCH /api/spaces/[id] → 放行到 updatePinnedTask（对照）
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { makePATCH, makeDELETE, makeRouteContext } from "../../helpers/make-request";
import type { TaskMember } from "@/lib/types";

// ============================================================
// Mock 实例
// ============================================================

const mocks = vi.hoisted(() => ({
  getUserFromRequest: vi.fn<(req: unknown) => Promise<{ id: string; email: string } | null>>(),
  // requireSpaceOwner 内部调用 getTaskMemberRecord（直接成员记录）
  getTaskMemberRecord: vi.fn<(taskId: string, userId: string) => Promise<TaskMember | null>>(),
  updatePinnedTask: vi.fn<(id: string, data: Record<string, unknown>) => Promise<unknown>>(),
  unpinTask: vi.fn<(id: string) => Promise<void>>(),
  deleteTask: vi.fn<(id: string, userId: string) => Promise<unknown>>(),
  initDb: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth", () => ({
  getUserFromRequest: mocks.getUserFromRequest,
}));

vi.mock("@/lib/db", () => ({
  getTaskMemberRecord: mocks.getTaskMemberRecord,
  updatePinnedTask: mocks.updatePinnedTask,
  unpinTask: mocks.unpinTask,
  deleteTask: mocks.deleteTask,
  initDb: mocks.initDb,
  getTaskById: vi.fn(),
  getTaskMembers: vi.fn(),
  getAllSpaceMembers: vi.fn(),
}));

// sql 仅在 PATCH org_id 分支用到，本测试不触发，mock 成空查询
vi.mock("@vercel/postgres", () => ({
  sql: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));

const { PATCH, DELETE } = await import("@/app/api/spaces/[id]/route");

const SPACE_ID = "space-001";
const ADMIN = { id: "user-admin", email: "admin@x.com" };
const OWNER = { id: "user-owner", email: "owner@x.com" };

const adminMember: TaskMember = {
  id: "m-admin",
  task_id: SPACE_ID,
  user_id: ADMIN.id,
  email: ADMIN.email,
  nickname: "admin",
  role: "admin",
  status: "active",
  joined_at: new Date().toISOString(),
};

const ownerMember: TaskMember = {
  ...adminMember,
  id: "m-owner",
  user_id: OWNER.id,
  email: OWNER.email,
  role: "owner",
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("方案 B 边界：空间层守卫对 admin 仍拒绝", () => {
  it("admin PATCH 改空间元信息 → 403", async () => {
    mocks.getUserFromRequest.mockResolvedValue(ADMIN);
    // requireSpaceOwner 查直接成员记录：admin 不是 owner
    mocks.getTaskMemberRecord.mockResolvedValue(adminMember);

    const req = makePATCH(`/api/spaces/${SPACE_ID}`, { name: "new name" });
    const res = await PATCH(req, makeRouteContext({ id: SPACE_ID }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("owner");
    // 未放行到更新
    expect(mocks.updatePinnedTask).not.toHaveBeenCalled();
  });

  it("admin DELETE 解散空间 → 403", async () => {
    mocks.getUserFromRequest.mockResolvedValue(ADMIN);
    mocks.getTaskMemberRecord.mockResolvedValue(adminMember);

    const req = makeDELETE(`/api/spaces/${SPACE_ID}`);
    const res = await DELETE(req, makeRouteContext({ id: SPACE_ID }));

    expect(res.status).toBe(403);
    expect(mocks.unpinTask).not.toHaveBeenCalled();
    expect(mocks.deleteTask).not.toHaveBeenCalled();
  });

  it("owner PATCH 改空间元信息 → 放行（对照）", async () => {
    mocks.getUserFromRequest.mockResolvedValue(OWNER);
    mocks.getTaskMemberRecord.mockResolvedValue(ownerMember);
    mocks.updatePinnedTask.mockResolvedValue({ id: SPACE_ID, title: "new name" });

    const req = makePATCH(`/api/spaces/${SPACE_ID}`, { name: "new name" });
    const res = await PATCH(req, makeRouteContext({ id: SPACE_ID }));

    expect(res.status).toBe(200);
    expect(mocks.updatePinnedTask).toHaveBeenCalled();
  });
});
