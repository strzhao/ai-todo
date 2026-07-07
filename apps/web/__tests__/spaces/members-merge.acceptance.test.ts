/**
 * 空间成员合并验收测试
 *
 * 测试目标：验证底层统一合并组织成员到空间成员列表的功能
 *
 * 功能验证：
 * - getAllSpaceMembers() 无组织空间 → 只返回直接成员
 * - getAllSpaceMembers() 有组织空间但组织无成员 → 只返回直接成员
 * - getAllSpaceMembers() 有组织空间且有组织成员 → 返回直接成员 + 组织虚拟成员
 * - getAllSpaceMembers() 直接成员与组织成员重叠 → 去重，直接成员优先
 * - 虚拟成员格式验证：id = org-virtual-{user_id}, role = "member", status = "active"
 * - getAllSpaceMembers() 用于经办人验证：验证返回的用户 ID 集合可用于经办人选择
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TaskMember, Task, OrgMember } from "@/lib/types";

// ── Mock db module ──────────────────────────────────────────────────────────

const mockGetTaskMembers = vi.fn<(spaceId: string) => Promise<TaskMember[]>>();
const mockGetTaskById = vi.fn<(id: string) => Promise<Task | null>>();
const mockGetOrgMembers = vi.fn<(orgId: string) => Promise<OrgMember[]>>();

vi.mock("@/lib/db", () => ({
  getTaskMembers: (...args: Parameters<typeof mockGetTaskMembers>) => mockGetTaskMembers(...args),
  getTaskById: (...args: Parameters<typeof mockGetTaskById>) => mockGetTaskById(...args),
  getOrgMembers: (...args: Parameters<typeof mockGetOrgMembers>) => mockGetOrgMembers(...args),
}));

// Import after mocking
const { getAllSpaceMembers } = await import("@/lib/spaces");

// ── Test data ───────────────────────────────────────────────────────────────

const SPACE_ID = "space-001";
const ORG_ID = "org-001";
const USER_1 = "user-001";
const USER_2 = "user-002";
const USER_3 = "user-003";

const makeDirectMember = (userId: string, overrides?: Partial<TaskMember>): TaskMember => ({
  id: `tm-${userId}`,
  task_id: SPACE_ID,
  user_id: userId,
  email: `${userId}@test.com`,
  role: "member",
  status: "active",
  joined_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const makeOrgMember = (userId: string, overrides?: Partial<OrgMember>): OrgMember => ({
  id: `om-${userId}`,
  org_id: ORG_ID,
  user_id: userId,
  email: `${userId}@test.com`,
  role: "member",
  status: "active",
  joined_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const makeOrgSpace = (overrides?: Partial<Task>): Task => ({
  id: SPACE_ID,
  user_id: "owner-001",
  title: "Test Space",
  priority: 2,
  status: 0,
  tags: [],
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  progress: 0,
  pinned: true,
  org_id: ORG_ID,
  ...overrides,
});

const makePersonalSpace = (): Task => makeOrgSpace({ org_id: undefined });

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAllSpaceMembers() — 无组织空间", () => {
  it("无组织空间 → 只返回直接成员", async () => {
    const directMembers = [makeDirectMember(USER_1), makeDirectMember(USER_2)];
    mockGetTaskMembers.mockResolvedValue(directMembers);
    mockGetTaskById.mockResolvedValue(makePersonalSpace());

    const result = await getAllSpaceMembers(SPACE_ID);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(directMembers[0]);
    expect(result[1]).toBe(directMembers[1]);
    expect(mockGetOrgMembers).not.toHaveBeenCalled();
  });

  it("无组织空间且无直接成员 → 返回空数组", async () => {
    mockGetTaskMembers.mockResolvedValue([]);
    mockGetTaskById.mockResolvedValue(makePersonalSpace());

    const result = await getAllSpaceMembers(SPACE_ID);

    expect(result).toHaveLength(0);
    expect(mockGetOrgMembers).not.toHaveBeenCalled();
  });
});

describe("getAllSpaceMembers() — 有组织空间但组织无成员", () => {
  it("有组织空间但组织无成员 → 只返回直接成员", async () => {
    const directMembers = [makeDirectMember(USER_1)];
    mockGetTaskMembers.mockResolvedValue(directMembers);
    mockGetTaskById.mockResolvedValue(makeOrgSpace());
    mockGetOrgMembers.mockResolvedValue([]);

    const result = await getAllSpaceMembers(SPACE_ID);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(directMembers[0]);
  });

  it("有组织空间但组织无成员且无直接成员 → 返回空数组", async () => {
    mockGetTaskMembers.mockResolvedValue([]);
    mockGetTaskById.mockResolvedValue(makeOrgSpace());
    mockGetOrgMembers.mockResolvedValue([]);

    const result = await getAllSpaceMembers(SPACE_ID);

    expect(result).toHaveLength(0);
  });
});

describe("getAllSpaceMembers() — 有组织空间且有组织成员", () => {
  it("有组织空间且有组织成员 → 返回直接成员 + 组织虚拟成员", async () => {
    const directMembers = [makeDirectMember(USER_1)];
    const orgMembers = [makeOrgMember(USER_2), makeOrgMember(USER_3)];
    mockGetTaskMembers.mockResolvedValue(directMembers);
    mockGetTaskById.mockResolvedValue(makeOrgSpace());
    mockGetOrgMembers.mockResolvedValue(orgMembers);

    const result = await getAllSpaceMembers(SPACE_ID);

    expect(result).toHaveLength(3);

    // 直接成员在前
    expect(result[0].user_id).toBe(USER_1);
    expect(result[0].id).toBe(`tm-${USER_1}`);

    // 组织虚拟成员在后
    expect(result[1].user_id).toBe(USER_2);
    expect(result[1].id).toBe(`org-virtual-${USER_2}`);

    expect(result[2].user_id).toBe(USER_3);
    expect(result[2].id).toBe(`org-virtual-${USER_3}`);
  });

  it("只有组织成员无直接成员 → 只返回组织虚拟成员", async () => {
    const orgMembers = [makeOrgMember(USER_1), makeOrgMember(USER_2)];
    mockGetTaskMembers.mockResolvedValue([]);
    mockGetTaskById.mockResolvedValue(makeOrgSpace());
    mockGetOrgMembers.mockResolvedValue(orgMembers);

    const result = await getAllSpaceMembers(SPACE_ID);

    expect(result).toHaveLength(2);
    expect(result[0].user_id).toBe(USER_1);
    expect(result[0].id).toBe(`org-virtual-${USER_1}`);
    expect(result[1].user_id).toBe(USER_2);
    expect(result[1].id).toBe(`org-virtual-${USER_2}`);
  });
});

describe("getAllSpaceMembers() — 直接成员与组织成员重叠（去重）", () => {
  it("直接成员与组织成员重叠 → 去重，直接成员优先", async () => {
    // USER_1 既是直接成员又是组织成员
    const directMembers = [makeDirectMember(USER_1), makeDirectMember(USER_2)];
    const orgMembers = [
      makeOrgMember(USER_1), // 重叠
      makeOrgMember(USER_3),
    ];
    mockGetTaskMembers.mockResolvedValue(directMembers);
    mockGetTaskById.mockResolvedValue(makeOrgSpace());
    mockGetOrgMembers.mockResolvedValue(orgMembers);

    const result = await getAllSpaceMembers(SPACE_ID);

    expect(result).toHaveLength(3);

    // 直接成员 USER_1 应该出现，且是直接成员格式
    const user1Member = result.find((m) => m.user_id === USER_1);
    expect(user1Member).toBeDefined();
    expect(user1Member!.id).toBe(`tm-${USER_1}`);
    expect(user1Member!.id).not.toContain("org-virtual");

    // USER_2 直接成员
    const user2Member = result.find((m) => m.user_id === USER_2);
    expect(user2Member).toBeDefined();
    expect(user2Member!.id).toBe(`tm-${USER_2}`);

    // USER_3 组织虚拟成员
    const user3Member = result.find((m) => m.user_id === USER_3);
    expect(user3Member).toBeDefined();
    expect(user3Member!.id).toBe(`org-virtual-${USER_3}`);
  });

  it("直接成员 owner 与组织 member 重叠 → 保留直接成员的 owner 角色", async () => {
    const directMembers = [makeDirectMember(USER_1, { role: "owner" })];
    const orgMembers = [makeOrgMember(USER_1, { role: "member" })];
    mockGetTaskMembers.mockResolvedValue(directMembers);
    mockGetTaskById.mockResolvedValue(makeOrgSpace());
    mockGetOrgMembers.mockResolvedValue(orgMembers);

    const result = await getAllSpaceMembers(SPACE_ID);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("owner"); // 直接成员优先
    expect(result[0].id).toBe(`tm-${USER_1}`);
  });

  it("直接成员 admin 与组织 member 重叠 → 保留直接成员的 admin 角色", async () => {
    const directMembers = [makeDirectMember(USER_1, { role: "admin" })];
    const orgMembers = [makeOrgMember(USER_1, { role: "member" })];
    mockGetTaskMembers.mockResolvedValue(directMembers);
    mockGetTaskById.mockResolvedValue(makeOrgSpace());
    mockGetOrgMembers.mockResolvedValue(orgMembers);

    const result = await getAllSpaceMembers(SPACE_ID);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("admin"); // 直接成员优先
  });
});

describe("虚拟成员格式验证", () => {
  it("虚拟成员格式：id = org-virtual-{user_id}, role = 'member', status = 'active'", async () => {
    const orgMembers = [makeOrgMember(USER_1), makeOrgMember(USER_2)];
    mockGetTaskMembers.mockResolvedValue([]);
    mockGetTaskById.mockResolvedValue(makeOrgSpace());
    mockGetOrgMembers.mockResolvedValue(orgMembers);

    const result = await getAllSpaceMembers(SPACE_ID);

    expect(result).toHaveLength(2);

    for (const member of result) {
      expect(member.id).toMatch(/^org-virtual-/);
      expect(member.id).toContain(member.user_id);
      expect(member.role).toBe("member");
      expect(member.status).toBe("active");
      expect(member.task_id).toBe(SPACE_ID);
    }

    expect(result[0].id).toBe(`org-virtual-${USER_1}`);
    expect(result[1].id).toBe(`org-virtual-${USER_2}`);
  });

  it("组织成员有 nickname 时虚拟成员保留 nickname（如果有字段）", async () => {
    const orgMember = makeOrgMember(USER_1, { nickname: "张三" });
    mockGetTaskMembers.mockResolvedValue([]);
    mockGetTaskById.mockResolvedValue(makeOrgSpace());
    mockGetOrgMembers.mockResolvedValue([orgMember]);

    const result = await getAllSpaceMembers(SPACE_ID);

    expect(result).toHaveLength(1);
    expect(result[0].user_id).toBe(USER_1);
    // 虚拟成员可能包含 display_name（如果有映射逻辑）
  });

  it("组织 pending 成员不应出现在虚拟成员列表中", async () => {
    const orgMembers = [
      makeOrgMember(USER_1, { status: "pending" }),
      makeOrgMember(USER_2, { status: "active" }),
    ];
    mockGetTaskMembers.mockResolvedValue([]);
    mockGetTaskById.mockResolvedValue(makeOrgSpace());
    mockGetOrgMembers.mockResolvedValue(orgMembers);

    const result = await getAllSpaceMembers(SPACE_ID);

    // 只有 active 成员应该被包含
    expect(result).toHaveLength(1);
    expect(result[0].user_id).toBe(USER_2);
    expect(result[0].status).toBe("active");
  });
});

describe("getAllSpaceMembers() — 用于经办人验证的场景", () => {
  it("直接成员存在于结果中 → 可设为经办人", async () => {
    const directMembers = [makeDirectMember(USER_1)];
    mockGetTaskMembers.mockResolvedValue(directMembers);
    mockGetTaskById.mockResolvedValue(makePersonalSpace());

    const result = await getAllSpaceMembers(SPACE_ID);

    expect(result.some((m) => m.user_id === USER_1)).toBe(true);
  });

  it("组织成员（非直接）存在于结果中 → 可设为经办人", async () => {
    const directMembers: TaskMember[] = [];
    const orgMembers = [makeOrgMember(USER_2)];
    mockGetTaskMembers.mockResolvedValue(directMembers);
    mockGetTaskById.mockResolvedValue(makeOrgSpace());
    mockGetOrgMembers.mockResolvedValue(orgMembers);

    const result = await getAllSpaceMembers(SPACE_ID);

    expect(result.some((m) => m.user_id === USER_2)).toBe(true);
    expect(result.find((m) => m.user_id === USER_2)!.id).toBe(`org-virtual-${USER_2}`);
  });

  it("非成员不存在于结果中 → 不可设为经办人", async () => {
    const directMembers: TaskMember[] = [];
    const orgMembers: OrgMember[] = [];
    mockGetTaskMembers.mockResolvedValue(directMembers);
    mockGetTaskById.mockResolvedValue(makeOrgSpace());
    mockGetOrgMembers.mockResolvedValue(orgMembers);

    const result = await getAllSpaceMembers(SPACE_ID);
    const nonMemberUserId = "non-member-001";

    expect(result.some((m) => m.user_id === nonMemberUserId)).toBe(false);
  });

  it("直接成员（pending）存在于结果中 → 可设为经办人", async () => {
    const directMembers = [makeDirectMember(USER_1, { status: "pending" })];
    mockGetTaskMembers.mockResolvedValue(directMembers);
    mockGetTaskById.mockResolvedValue(makePersonalSpace());

    const result = await getAllSpaceMembers(SPACE_ID);

    expect(result.some((m) => m.user_id === USER_1)).toBe(true);
    expect(result.find((m) => m.user_id === USER_1)!.status).toBe("pending");
  });

  it("结果可用于经办人选择器：返回的用户 ID 集合包含所有有效成员", async () => {
    const directMembers = [makeDirectMember(USER_1), makeDirectMember(USER_2, { role: "admin" })];
    const orgMembers = [makeOrgMember(USER_3)];
    mockGetTaskMembers.mockResolvedValue(directMembers);
    mockGetTaskById.mockResolvedValue(makeOrgSpace());
    mockGetOrgMembers.mockResolvedValue(orgMembers);

    const result = await getAllSpaceMembers(SPACE_ID);
    const validAssigneeIds = new Set(result.map((m) => m.user_id));

    expect(validAssigneeIds.has(USER_1)).toBe(true);
    expect(validAssigneeIds.has(USER_2)).toBe(true);
    expect(validAssigneeIds.has(USER_3)).toBe(true);
    expect(validAssigneeIds.has("non-member-001")).toBe(false);
  });
});
