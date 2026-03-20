import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TaskMember, Task, OrgMember } from "@/lib/types";

// ── Mock db module ──────────────────────────────────────────────────────────

const mockGetTaskMemberRecord =
  vi.fn<(spaceId: string, userId: string) => Promise<TaskMember | null>>();
const mockGetTaskById = vi.fn<(id: string) => Promise<Task | null>>();
const mockGetOrgMemberRecord =
  vi.fn<(orgId: string, userId: string) => Promise<OrgMember | null>>();

vi.mock("@/lib/db", () => ({
  getTaskMemberRecord: (...args: Parameters<typeof mockGetTaskMemberRecord>) =>
    mockGetTaskMemberRecord(...args),
  getTaskById: (...args: Parameters<typeof mockGetTaskById>) => mockGetTaskById(...args),
  getOrgMemberRecord: (...args: Parameters<typeof mockGetOrgMemberRecord>) =>
    mockGetOrgMemberRecord(...args),
}));

// Import after mocking
const { getSpaceMember, requireSpaceMember, requireSpaceOwner, requireSpaceAdminOrOwner } =
  await import("@/lib/spaces");

// ── Test data ───────────────────────────────────────────────────────────────

const USER_ID = "user-001";
const SPACE_ID = "space-001";
const ORG_ID = "org-001";

const makeDirectMember = (overrides?: Partial<TaskMember>): TaskMember => ({
  id: "tm-001",
  task_id: SPACE_ID,
  user_id: USER_ID,
  email: "user@test.com",
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

const makeOrgMember = (overrides?: Partial<OrgMember>): OrgMember => ({
  id: "om-001",
  org_id: ORG_ID,
  user_id: USER_ID,
  email: "user@test.com",
  role: "member",
  status: "active",
  joined_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSpaceMember — 组织成员隐式访问", () => {
  it("直接 active 成员 → 返回直接成员记录", async () => {
    const direct = makeDirectMember();
    mockGetTaskMemberRecord.mockResolvedValue(direct);

    const result = await getSpaceMember(SPACE_ID, USER_ID);

    expect(result).toBe(direct);
    // 不应查 org 成员（短路）
    expect(mockGetTaskById).not.toHaveBeenCalled();
    expect(mockGetOrgMemberRecord).not.toHaveBeenCalled();
  });

  it("直接 pending 成员 + org active 成员 → 返回 org 虚拟 member", async () => {
    mockGetTaskMemberRecord.mockResolvedValue(makeDirectMember({ status: "pending" }));
    mockGetTaskById.mockResolvedValue(makeOrgSpace());
    mockGetOrgMemberRecord.mockResolvedValue(makeOrgMember());

    const result = await getSpaceMember(SPACE_ID, USER_ID);

    expect(result).not.toBeNull();
    expect(result!.role).toBe("member");
    expect(result!.status).toBe("active");
  });

  it("非直接成员 + org active 成员（空间有 org_id）→ 返回虚拟 member", async () => {
    mockGetTaskMemberRecord.mockResolvedValue(null);
    mockGetTaskById.mockResolvedValue(makeOrgSpace());
    mockGetOrgMemberRecord.mockResolvedValue(makeOrgMember());

    const result = await getSpaceMember(SPACE_ID, USER_ID);

    expect(result).not.toBeNull();
    expect(result!.role).toBe("member");
    expect(result!.status).toBe("active");
    expect(result!.user_id).toBe(USER_ID);
    expect(result!.task_id).toBe(SPACE_ID);
  });

  it("非直接成员 + org active 成员（空间无 org_id）→ 返回 null", async () => {
    mockGetTaskMemberRecord.mockResolvedValue(null);
    mockGetTaskById.mockResolvedValue(makePersonalSpace());

    const result = await getSpaceMember(SPACE_ID, USER_ID);

    expect(result).toBeNull();
    // 个人空间不应查 org 成员
    expect(mockGetOrgMemberRecord).not.toHaveBeenCalled();
  });

  it("非直接成员 + 非 org 成员 → 返回 null", async () => {
    mockGetTaskMemberRecord.mockResolvedValue(null);
    mockGetTaskById.mockResolvedValue(makeOrgSpace());
    mockGetOrgMemberRecord.mockResolvedValue(null);

    const result = await getSpaceMember(SPACE_ID, USER_ID);

    expect(result).toBeNull();
  });

  it("非直接成员 + org pending 成员 → 返回 null", async () => {
    mockGetTaskMemberRecord.mockResolvedValue(null);
    mockGetTaskById.mockResolvedValue(makeOrgSpace());
    mockGetOrgMemberRecord.mockResolvedValue(makeOrgMember({ status: "pending" }));

    const result = await getSpaceMember(SPACE_ID, USER_ID);

    expect(result).toBeNull();
  });

  it("直接 owner + org 成员 → 返回 owner（直接成员优先）", async () => {
    const owner = makeDirectMember({ role: "owner" });
    mockGetTaskMemberRecord.mockResolvedValue(owner);

    const result = await getSpaceMember(SPACE_ID, USER_ID);

    expect(result).toBe(owner);
    expect(result!.role).toBe("owner");
  });

  it("直接 admin + org 成员 → 返回 admin（直接成员优先）", async () => {
    const admin = makeDirectMember({ role: "admin" });
    mockGetTaskMemberRecord.mockResolvedValue(admin);

    const result = await getSpaceMember(SPACE_ID, USER_ID);

    expect(result).toBe(admin);
    expect(result!.role).toBe("admin");
  });

  it("空间不存在 → 返回 null", async () => {
    mockGetTaskMemberRecord.mockResolvedValue(null);
    mockGetTaskById.mockResolvedValue(null);

    const result = await getSpaceMember(SPACE_ID, USER_ID);

    expect(result).toBeNull();
  });
});

describe("requireSpaceMember — 组织成员不抛异常", () => {
  it("org active 成员访问 org 空间 → 不抛异常", async () => {
    mockGetTaskMemberRecord.mockResolvedValue(null);
    mockGetTaskById.mockResolvedValue(makeOrgSpace());
    mockGetOrgMemberRecord.mockResolvedValue(makeOrgMember());

    await expect(requireSpaceMember(SPACE_ID, USER_ID)).resolves.toBeDefined();
  });

  it("非成员访问 org 空间 → 抛 403", async () => {
    mockGetTaskMemberRecord.mockResolvedValue(null);
    mockGetTaskById.mockResolvedValue(makeOrgSpace());
    mockGetOrgMemberRecord.mockResolvedValue(null);

    await expect(requireSpaceMember(SPACE_ID, USER_ID)).rejects.toMatchObject({ status: 403 });
  });

  it("非成员访问个人空间 → 抛 403", async () => {
    mockGetTaskMemberRecord.mockResolvedValue(null);
    mockGetTaskById.mockResolvedValue(makePersonalSpace());

    await expect(requireSpaceMember(SPACE_ID, USER_ID)).rejects.toMatchObject({ status: 403 });
  });
});

describe("requireSpaceOwner — org 成员不能获得 owner 权限", () => {
  it("org 成员（非直接 owner）→ 抛 403", async () => {
    // requireSpaceOwner 只查直接成员，不查 org
    mockGetTaskMemberRecord.mockResolvedValue(null);

    await expect(requireSpaceOwner(SPACE_ID, USER_ID)).rejects.toMatchObject({ status: 403 });
  });

  it("直接 owner → 不抛异常", async () => {
    mockGetTaskMemberRecord.mockResolvedValue(makeDirectMember({ role: "owner" }));

    await expect(requireSpaceOwner(SPACE_ID, USER_ID)).resolves.toBeUndefined();
  });
});

describe("requireSpaceAdminOrOwner — org 成员不能获得 admin 权限", () => {
  it("org 成员（非直接 admin/owner）→ 抛 403", async () => {
    mockGetTaskMemberRecord.mockResolvedValue(null);

    await expect(requireSpaceAdminOrOwner(SPACE_ID, USER_ID)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("直接 admin → 不抛异常", async () => {
    mockGetTaskMemberRecord.mockResolvedValue(makeDirectMember({ role: "admin" }));

    await expect(requireSpaceAdminOrOwner(SPACE_ID, USER_ID)).resolves.toBeDefined();
  });
});
