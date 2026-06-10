/**
 * API Route acceptance test: PATCH /api/spaces/[id]/members/[uid]
 *
 * 验证"组织继承成员角色管理"功能：
 * 空间 owner 可以为 org-virtual 成员设置角色，系统自动物化为直接成员。
 *
 * 测试覆盖：
 * - owner 将 org-virtual 成员设为 admin（200 + role: admin + 物化）
 * - owner 将 org-virtual 成员设为 member（200 + role: member + 物化）
 * - 物化后再次 PATCH 该成员（正常更新，不再是 virtual）
 * - 非 owner 尝试设角色（403）
 * - 不存在的用户设角色（404，非成员也非 org 成员）
 * - rowToMember 角色类型正确性（返回 admin 角色）
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { makePATCH, makeRouteContext } from "../../helpers/make-request";
import type { TaskMember } from "@/lib/types";

// ============================================================
// Mock 实例（vi.hoisted 确保在模块解析前可用）
// ============================================================

const mocks = vi.hoisted(() => ({
  getUserFromRequest: vi.fn<(req: unknown) => Promise<{ id: string; email: string } | null>>(),
  getTaskMemberRecord: vi.fn<(taskId: string, userId: string) => Promise<TaskMember | null>>(),
  updateTaskMember:
    vi.fn<
      (taskId: string, userId: string, data: Record<string, unknown>) => Promise<TaskMember | null>
    >(),
  addTaskMember:
    vi.fn<
      (
        taskId: string,
        userId: string,
        email: string,
        role: TaskMember["role"],
        status?: "active" | "pending"
      ) => Promise<TaskMember>
    >(),
  getTaskById: vi.fn<(id: string) => Promise<unknown>>(),
  getSpaceMember: vi.fn<(spaceId: string, userId: string) => Promise<TaskMember | null>>(),
}));

// ============================================================
// Mock 模块声明
// ============================================================

vi.mock("@/lib/auth", () => ({
  getUserFromRequest: mocks.getUserFromRequest,
}));

vi.mock("@/lib/db", () => ({
  getTaskMemberRecord: mocks.getTaskMemberRecord,
  updateTaskMember: mocks.updateTaskMember,
  addTaskMember: mocks.addTaskMember,
  getTaskById: mocks.getTaskById,
  removeTaskMember: vi.fn(),
  initDb: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/spaces", () => ({
  getSpaceMember: mocks.getSpaceMember,
  requireSpaceMember: vi.fn().mockResolvedValue(undefined),
  getAllSpaceMembers: vi.fn().mockResolvedValue([]),
}));

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
  fireNotification: vi.fn(),
  fireNotifications: vi.fn(),
}));

vi.mock("@vercel/postgres", () => ({
  sql: Object.assign(vi.fn(), { query: vi.fn() }),
}));

// ============================================================
// Fixtures
// ============================================================

const SPACE_ID = "space-1";
const OWNER_ID = "user-1";
const OWNER_EMAIL = "owner@example.com";
const TARGET_USER_ID = "user-2";
const TARGET_EMAIL = "member@example.com";
const VIRTUAL_UID = `org-virtual-${TARGET_USER_ID}`;
const NON_MEMBER_ID = "user-99";

/** space owner 的 TaskMember 记录 */
const ownerActor: TaskMember = {
  id: "member-owner-1",
  task_id: SPACE_ID,
  user_id: OWNER_ID,
  email: OWNER_EMAIL,
  role: "owner",
  status: "active",
  joined_at: "2026-01-01T00:00:00Z",
};

/**
 * org-virtual 成员 getSpaceMember 返回的虚拟 TaskMember
 * （org 成员自动继承 space member 角色，id 带 org-virtual- 前缀）
 */
const virtualOrgMember: TaskMember = {
  id: VIRTUAL_UID,
  task_id: SPACE_ID,
  user_id: TARGET_USER_ID,
  email: TARGET_EMAIL,
  role: "member",
  status: "active",
  joined_at: "2026-01-01T00:00:00Z",
};

/** addTaskMember 物化后返回的 TaskMember 工厂 */
function makeMaterialized(overrides?: Partial<TaskMember>): TaskMember {
  return {
    id: "member-materialized-2",
    task_id: SPACE_ID,
    user_id: TARGET_USER_ID,
    email: TARGET_EMAIL,
    role: "admin",
    status: "active",
    joined_at: "2026-06-10T00:00:00Z",
    ...overrides,
  };
}

// ============================================================
// 测试套件
// ============================================================

describe("PATCH /api/spaces/[id]/members/[uid] - 组织继承成员角色管理", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------
  // 场景：owner 将 org-virtual 成员设为 admin
  // ----------------------------------------------------------
  describe("owner 将 org-virtual 成员设为 admin", () => {
    it("返回 200，role 为 admin，新增 task_members 行（物化）", async () => {
      // 认证为 owner
      mocks.getUserFromRequest.mockResolvedValue({ id: OWNER_ID, email: OWNER_EMAIL });
      // actor 权限检查 → 是 owner
      mocks.getTaskMemberRecord.mockResolvedValueOnce(ownerActor);
      // memberBefore：org-virtual uid 无直接记录
      mocks.getTaskMemberRecord.mockResolvedValueOnce(null);
      // getSpaceMember：org 成员验证 → 返回虚拟成员
      mocks.getSpaceMember.mockResolvedValueOnce(virtualOrgMember);
      // addTaskMember：物化 + 设 admin
      const materialized = makeMaterialized({ role: "admin" });
      mocks.addTaskMember.mockResolvedValueOnce(materialized);

      const { PATCH } = await import("@/app/api/spaces/[id]/members/[uid]/route");
      const res = await PATCH(
        makePATCH(`/api/spaces/${SPACE_ID}/members/${VIRTUAL_UID}`, { role: "admin" }),
        makeRouteContext({ id: SPACE_ID, uid: VIRTUAL_UID })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.role).toBe("admin");
      expect(body.task_id).toBe(SPACE_ID);
      // 物化后 user_id 是真实用户 ID（非 org-virtual- 前缀）
      expect(body.user_id).toBe(TARGET_USER_ID);
      // 确认物化路径走了 addTaskMember（非 updateTaskMember）
      expect(mocks.addTaskMember).toHaveBeenCalledTimes(1);
      expect(mocks.updateTaskMember).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------
  // 场景：owner 将 org-virtual 成员设为 member
  // ----------------------------------------------------------
  describe("owner 将 org-virtual 成员设为 member", () => {
    it("返回 200，role 为 member，新增 task_members 行（物化）", async () => {
      mocks.getUserFromRequest.mockResolvedValue({ id: OWNER_ID, email: OWNER_EMAIL });
      mocks.getTaskMemberRecord.mockResolvedValueOnce(ownerActor);
      mocks.getTaskMemberRecord.mockResolvedValueOnce(null);
      mocks.getSpaceMember.mockResolvedValueOnce(virtualOrgMember);
      const materialized = makeMaterialized({ role: "member" });
      mocks.addTaskMember.mockResolvedValueOnce(materialized);

      const { PATCH } = await import("@/app/api/spaces/[id]/members/[uid]/route");
      const res = await PATCH(
        makePATCH(`/api/spaces/${SPACE_ID}/members/${VIRTUAL_UID}`, { role: "member" }),
        makeRouteContext({ id: SPACE_ID, uid: VIRTUAL_UID })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.role).toBe("member");
      expect(body.user_id).toBe(TARGET_USER_ID);
      expect(mocks.addTaskMember).toHaveBeenCalledTimes(1);
    });
  });

  // ----------------------------------------------------------
  // 场景：物化后再次 PATCH（不再是 virtual，走 updateTaskMember）
  // ----------------------------------------------------------
  describe("物化后再次 PATCH 该成员", () => {
    it("直接成员更新角色正常（不再是 org-virtual 路径）", async () => {
      mocks.getUserFromRequest.mockResolvedValue({ id: OWNER_ID, email: OWNER_EMAIL });
      const materialized = makeMaterialized({ role: "member" });

      // === 第一次 PATCH（org-virtual → 物化） ===
      // actor check
      mocks.getTaskMemberRecord.mockResolvedValueOnce(ownerActor);
      // memberBefore：org-virtual 无直接记录
      mocks.getTaskMemberRecord.mockResolvedValueOnce(null);
      // getSpaceMember：验证 org 成员
      mocks.getSpaceMember.mockResolvedValueOnce(virtualOrgMember);
      // addTaskMember：物化为 member
      mocks.addTaskMember.mockResolvedValueOnce(materialized);

      const { PATCH } = await import("@/app/api/spaces/[id]/members/[uid]/route");

      // 第一次 PATCH
      const res1 = await PATCH(
        makePATCH(`/api/spaces/${SPACE_ID}/members/${VIRTUAL_UID}`, { role: "member" }),
        makeRouteContext({ id: SPACE_ID, uid: VIRTUAL_UID })
      );
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.role).toBe("member");
      expect(mocks.addTaskMember).toHaveBeenCalledTimes(1);

      // === 第二次 PATCH（直接成员 → 更新角色） ===
      const targetUid = materialized.user_id; // 真实 user_id，不再 org-virtual-
      // actor check
      mocks.getTaskMemberRecord.mockResolvedValueOnce(ownerActor);
      // memberBefore：现在是直接成员了
      mocks.getTaskMemberRecord.mockResolvedValueOnce(materialized);
      // updateTaskMember：直接更新
      mocks.updateTaskMember.mockResolvedValueOnce({
        ...materialized,
        role: "admin",
      });

      const res2 = await PATCH(
        makePATCH(`/api/spaces/${SPACE_ID}/members/${targetUid}`, { role: "admin" }),
        makeRouteContext({ id: SPACE_ID, uid: targetUid })
      );
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.role).toBe("admin");
      // 第二次走 updateTaskMember，不走 addTaskMember
      expect(mocks.updateTaskMember).toHaveBeenCalledTimes(1);
      expect(mocks.addTaskMember).toHaveBeenCalledTimes(1); // 仅第一次
    });
  });

  // ----------------------------------------------------------
  // 场景：非 owner 尝试设角色
  // ----------------------------------------------------------
  describe("非 owner 执行", () => {
    it("普通 member 无法设角色，返回 403", async () => {
      mocks.getUserFromRequest.mockResolvedValue({
        id: "user-3",
        email: "regular@example.com",
      });
      const regularMember: TaskMember = {
        ...ownerActor,
        id: "member-3",
        user_id: "user-3",
        email: "regular@example.com",
        role: "member",
      };
      mocks.getTaskMemberRecord.mockResolvedValueOnce(regularMember);

      const { PATCH } = await import("@/app/api/spaces/[id]/members/[uid]/route");
      const res = await PATCH(
        makePATCH(`/api/spaces/${SPACE_ID}/members/${VIRTUAL_UID}`, { role: "admin" }),
        makeRouteContext({ id: SPACE_ID, uid: VIRTUAL_UID })
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBeTruthy();
      // 无副作用：未物化
      expect(mocks.addTaskMember).not.toHaveBeenCalled();
      expect(mocks.updateTaskMember).not.toHaveBeenCalled();
    });

    it("非空间成员无法设角色，返回 403", async () => {
      mocks.getUserFromRequest.mockResolvedValue({
        id: "outsider",
        email: "outsider@example.com",
      });
      // actor 不存在 → null
      mocks.getTaskMemberRecord.mockResolvedValueOnce(null);

      const { PATCH } = await import("@/app/api/spaces/[id]/members/[uid]/route");
      const res = await PATCH(
        makePATCH(`/api/spaces/${SPACE_ID}/members/${VIRTUAL_UID}`, { role: "admin" }),
        makeRouteContext({ id: SPACE_ID, uid: VIRTUAL_UID })
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBeTruthy();
      expect(mocks.addTaskMember).not.toHaveBeenCalled();
      expect(mocks.updateTaskMember).not.toHaveBeenCalled();
    });

    it("未认证用户无法设角色，返回 401", async () => {
      mocks.getUserFromRequest.mockResolvedValue(null);

      const { PATCH } = await import("@/app/api/spaces/[id]/members/[uid]/route");
      const res = await PATCH(
        makePATCH(`/api/spaces/${SPACE_ID}/members/${VIRTUAL_UID}`, { role: "admin" }),
        makeRouteContext({ id: SPACE_ID, uid: VIRTUAL_UID })
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });
  });

  // ----------------------------------------------------------
  // 场景：目标不存在（非成员也非 org 成员）
  // ----------------------------------------------------------
  describe("目标不存在", () => {
    it("非 org-virtual 的无效 uid 返回 404", async () => {
      mocks.getUserFromRequest.mockResolvedValue({ id: OWNER_ID, email: OWNER_EMAIL });
      // actor 存在且是 owner
      mocks.getTaskMemberRecord.mockResolvedValueOnce(ownerActor);
      // memberBefore：target uid 无直接成员记录
      mocks.getTaskMemberRecord.mockResolvedValueOnce(null);
      // getSpaceMember：也不是 org 成员 → null
      mocks.getSpaceMember.mockResolvedValueOnce(null);

      const { PATCH } = await import("@/app/api/spaces/[id]/members/[uid]/route");
      const res = await PATCH(
        makePATCH(`/api/spaces/${SPACE_ID}/members/${NON_MEMBER_ID}`, { role: "admin" }),
        makeRouteContext({ id: SPACE_ID, uid: NON_MEMBER_ID })
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: "Not found" });
      // 无副作用
      expect(mocks.addTaskMember).not.toHaveBeenCalled();
      expect(mocks.updateTaskMember).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------
  // 场景：rowToMember 角色类型正确性
  // ----------------------------------------------------------
  describe("rowToMember 角色类型正确性", () => {
    it("物化后返回的 TaskMember.role 为 admin（类型校验）", async () => {
      mocks.getUserFromRequest.mockResolvedValue({ id: OWNER_ID, email: OWNER_EMAIL });
      mocks.getTaskMemberRecord.mockResolvedValueOnce(ownerActor);
      mocks.getTaskMemberRecord.mockResolvedValueOnce(null);
      mocks.getSpaceMember.mockResolvedValueOnce(virtualOrgMember);
      const materialized = makeMaterialized({ role: "admin" });
      mocks.addTaskMember.mockResolvedValueOnce(materialized);

      const { PATCH } = await import("@/app/api/spaces/[id]/members/[uid]/route");
      const res = await PATCH(
        makePATCH(`/api/spaces/${SPACE_ID}/members/${VIRTUAL_UID}`, { role: "admin" }),
        makeRouteContext({ id: SPACE_ID, uid: VIRTUAL_UID })
      );

      expect(res.status).toBe(200);
      const body: TaskMember = await res.json();

      // 类型断言：role 必须是合法的 union 类型成员
      const role: "owner" | "admin" | "member" = body.role;
      expect(role).toBe("admin");

      // 结构完整性：rowToMember 转换后的 TaskMember
      expect(body.id).toBeTruthy();
      expect(body.task_id).toBe(SPACE_ID);
      expect(body.user_id).toBe(TARGET_USER_ID);
      expect(body.email).toBeTruthy();
      expect(body.status).toBe("active");
      expect(body.joined_at).toBeTruthy();
    });

    it("物化后返回的 TaskMember.role 为 member（类型校验）", async () => {
      mocks.getUserFromRequest.mockResolvedValue({ id: OWNER_ID, email: OWNER_EMAIL });
      mocks.getTaskMemberRecord.mockResolvedValueOnce(ownerActor);
      mocks.getTaskMemberRecord.mockResolvedValueOnce(null);
      mocks.getSpaceMember.mockResolvedValueOnce(virtualOrgMember);
      const materialized = makeMaterialized({ role: "member" });
      mocks.addTaskMember.mockResolvedValueOnce(materialized);

      const { PATCH } = await import("@/app/api/spaces/[id]/members/[uid]/route");
      const res = await PATCH(
        makePATCH(`/api/spaces/${SPACE_ID}/members/${VIRTUAL_UID}`, { role: "member" }),
        makeRouteContext({ id: SPACE_ID, uid: VIRTUAL_UID })
      );

      expect(res.status).toBe(200);
      const body: TaskMember = await res.json();
      const role: "owner" | "admin" | "member" = body.role;
      expect(role).toBe("member");
    });
  });

  // ----------------------------------------------------------
  // 边界场景
  // ----------------------------------------------------------
  describe("边界场景", () => {
    it("preferredRegion 导出为 hkg1", async () => {
      const mod = await import("@/app/api/spaces/[id]/members/[uid]/route");
      expect(mod.preferredRegion).toBe("hkg1");
    });

    it("addTaskMember role 参数接受 admin（类型校验）", async () => {
      mocks.getUserFromRequest.mockResolvedValue({ id: OWNER_ID, email: OWNER_EMAIL });
      mocks.getTaskMemberRecord.mockResolvedValueOnce(ownerActor);
      mocks.getTaskMemberRecord.mockResolvedValueOnce(null);
      mocks.getSpaceMember.mockResolvedValueOnce(virtualOrgMember);
      const materialized = makeMaterialized({ role: "admin" });
      mocks.addTaskMember.mockResolvedValueOnce(materialized);

      const { PATCH } = await import("@/app/api/spaces/[id]/members/[uid]/route");
      const res = await PATCH(
        makePATCH(`/api/spaces/${SPACE_ID}/members/${VIRTUAL_UID}`, { role: "admin" }),
        makeRouteContext({ id: SPACE_ID, uid: VIRTUAL_UID })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.role).toBe("admin");
      // addTaskMember 被调用时 role 参数 = "admin"
      expect(mocks.addTaskMember).toHaveBeenCalledWith(
        SPACE_ID,
        VIRTUAL_UID,
        virtualOrgMember.email,
        "admin",
        "active"
      );
    });
  });
});
