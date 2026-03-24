/**
 * 空间加入引导 — 验收测试（红队）
 *
 * 基于设计文档编写，不阅读蓝队实现代码。
 *
 * 设计文档约定：
 * 1. GET /api/spaces/{id} 对非成员返回 403 时，附带 space_preview（title, invite_mode, invite_code, member_count）和 pending 布尔值
 * 2. 用户已申请过（有 pending 成员记录）时，pending 为 true
 * 3. 空间不存在时返回 404，不附 preview
 * 4. space_preview 不包含敏感信息
 *
 * 验收标准：
 * AC-1: 非成员 403 响应包含 space_preview（title, invite_mode, invite_code, member_count）
 * AC-2: pending 字段正确（无记录时 false，有 pending 记录时 true）
 * AC-3: 空间不存在返回 404，无 preview
 * AC-4: space_preview 不包含敏感信息（无用户数据、任务内容等）
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

const mockInitDb = vi.fn().mockResolvedValue(undefined);
const mockGetTaskById = vi.fn();
const mockGetTaskMembers = vi.fn();
const mockGetTaskMemberRecord = vi.fn();
const mockGetOrgMemberRecord = vi.fn();

vi.mock("@/lib/db", () => ({
  initDb: (...args: unknown[]) => mockInitDb(...args),
  getTaskById: (...args: unknown[]) => mockGetTaskById(...args),
  getTaskMembers: (...args: unknown[]) => mockGetTaskMembers(...args),
  getTaskMemberRecord: (...args: unknown[]) => mockGetTaskMemberRecord(...args),
  getOrgMemberRecord: (...args: unknown[]) => mockGetOrgMemberRecord(...args),
  updatePinnedTask: vi.fn(),
  unpinTask: vi.fn(),
  deleteTask: vi.fn(),
}));

// ── 测试常量 ──────────────────────────────────────────────────────────────────

const USER_ID = "user-nonmember-001";
const USER_EMAIL = "nonmember@example.com";
const OWNER_ID = "user-owner-001";
const SPACE_ID = "space-uuid-001";
const INVITE_CODE = "abcd1234";

function makeSpace(overrides: Record<string, unknown> = {}) {
  return {
    id: SPACE_ID,
    user_id: OWNER_ID,
    title: "项目协作空间",
    description: "这是一个协作空间的详细描述",
    priority: 2,
    status: 0,
    tags: ["内部", "协作"],
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    progress: 0,
    pinned: true,
    invite_code: INVITE_CODE,
    invite_mode: "open",
    member_count: 5,
    org_id: null,
    ...overrides,
  };
}

function makeMembers() {
  return [
    {
      id: "tm-001",
      task_id: SPACE_ID,
      user_id: OWNER_ID,
      email: "owner@example.com",
      role: "owner",
      status: "active",
      joined_at: "2026-01-01T00:00:00Z",
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTaggedTemplate.mockReturnValue({ rows: [] });
  mockQuery.mockResolvedValue({ rows: [] });
  // Default: user is authenticated but not a member
  mockGetUserFromRequest.mockResolvedValue({ id: USER_ID, email: USER_EMAIL });
  // Default: non-member (getTaskMemberRecord returns null → requireSpaceMember throws)
  mockGetTaskMemberRecord.mockResolvedValue(null);
  mockGetOrgMemberRecord.mockResolvedValue(null);
  // Default: getTaskMembers returns members list (needed for preview path)
  mockGetTaskMembers.mockResolvedValue(makeMembers());
});

async function callSpaceGET(spaceId: string = SPACE_ID) {
  const { GET } = await import("@/app/api/spaces/[id]/route");
  const req = new NextRequest(`https://ai-todo.stringzhao.life/api/spaces/${spaceId}`, {
    method: "GET",
  });
  return GET(req, { params: Promise.resolve({ id: spaceId }) });
}

// ═══════════════════════════════════════════════════════════════════════════════
// AC-1: 非成员 403 响应包含 space_preview
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-1: 非成员 403 响应包含 space_preview", () => {
  it("非成员访问空间 → 403 响应包含 space_preview 对象", async () => {
    // Space exists with data
    mockGetTaskById.mockResolvedValue(makeSpace());

    const res = await callSpaceGET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.space_preview).toBeDefined();
    expect(typeof body.space_preview).toBe("object");
  });

  it("space_preview 包含 title 字段", async () => {
    mockGetTaskById.mockResolvedValue(makeSpace());

    const res = await callSpaceGET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.space_preview.title).toBe("项目协作空间");
  });

  it("space_preview 包含 invite_mode 字段", async () => {
    mockGetTaskById.mockResolvedValue(makeSpace({ invite_mode: "open" }));

    const res = await callSpaceGET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.space_preview.invite_mode).toBe("open");
  });

  it("space_preview 对 approval 模式的空间返回 invite_mode:'approval'", async () => {
    mockGetTaskById.mockResolvedValue(makeSpace({ invite_mode: "approval" }));

    const res = await callSpaceGET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.space_preview.invite_mode).toBe("approval");
  });

  it("space_preview 包含 invite_code 字段", async () => {
    mockGetTaskById.mockResolvedValue(makeSpace());

    const res = await callSpaceGET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.space_preview.invite_code).toBe(INVITE_CODE);
  });

  it("space_preview 包含 member_count 字段（数字类型）", async () => {
    const members = [
      { id: "tm-1", task_id: SPACE_ID, user_id: OWNER_ID, email: "a@test.com", role: "owner", status: "active", joined_at: "2026-01-01T00:00:00Z" },
      { id: "tm-2", task_id: SPACE_ID, user_id: "u2", email: "b@test.com", role: "member", status: "active", joined_at: "2026-01-01T00:00:00Z" },
      { id: "tm-3", task_id: SPACE_ID, user_id: "u3", email: "c@test.com", role: "member", status: "active", joined_at: "2026-01-01T00:00:00Z" },
    ];
    mockGetTaskById.mockResolvedValue(makeSpace());
    mockGetTaskMembers.mockResolvedValue(members);

    const res = await callSpaceGET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(typeof body.space_preview.member_count).toBe("number");
    // member_count should reflect the actual active member count
    expect(body.space_preview.member_count).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-2: pending 字段正确反映用户申请状态
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-2: pending 字段正确反映用户申请状态", () => {
  it("非成员且无申请记录 → pending 为 false", async () => {
    mockGetTaskById.mockResolvedValue(makeSpace());
    // No member record at all
    mockGetTaskMemberRecord.mockResolvedValue(null);

    const res = await callSpaceGET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.pending).toBe(false);
  });

  it("有 pending 成员记录 → pending 为 true", async () => {
    mockGetTaskById.mockResolvedValue(makeSpace({ invite_mode: "approval" }));
    // User has a pending member record (applied but not yet approved)
    mockGetTaskMemberRecord.mockResolvedValue({
      id: "tm-pending-001",
      task_id: SPACE_ID,
      user_id: USER_ID,
      email: USER_EMAIL,
      role: "member",
      status: "pending",
      joined_at: "2026-03-20T10:00:00Z",
    });

    const res = await callSpaceGET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.pending).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-3: 空间不存在返回 404，无 preview
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-3: 空间不存在返回 404 无 preview", () => {
  it("空间不存在 → 返回 404", async () => {
    mockGetTaskById.mockResolvedValue(null);
    mockGetTaskMembers.mockResolvedValue([]);

    const res = await callSpaceGET("nonexistent-space-id");

    expect(res.status).toBe(404);
  });

  it("404 响应不包含 space_preview", async () => {
    mockGetTaskById.mockResolvedValue(null);
    mockGetTaskMembers.mockResolvedValue([]);

    const res = await callSpaceGET("nonexistent-space-id");
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.space_preview).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-4: space_preview 不包含敏感信息
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-4: space_preview 不包含敏感信息", () => {
  it("space_preview 不包含 user_id（空间创建者 ID）", async () => {
    mockGetTaskById.mockResolvedValue(makeSpace());

    const res = await callSpaceGET();
    const body = await res.json();

    expect(res.status).toBe(403);
    const preview = body.space_preview;
    expect(preview.user_id).toBeUndefined();
  });

  it("space_preview 不包含 description（可能含敏感描述）", async () => {
    mockGetTaskById.mockResolvedValue(makeSpace());

    const res = await callSpaceGET();
    const body = await res.json();

    expect(res.status).toBe(403);
    const preview = body.space_preview;
    expect(preview.description).toBeUndefined();
  });

  it("space_preview 不包含 tags（可能含敏感标签）", async () => {
    mockGetTaskById.mockResolvedValue(makeSpace());

    const res = await callSpaceGET();
    const body = await res.json();

    expect(res.status).toBe(403);
    const preview = body.space_preview;
    expect(preview.tags).toBeUndefined();
  });

  it("space_preview 不包含 org_id（组织 ID）", async () => {
    mockGetTaskById.mockResolvedValue(makeSpace({ org_id: "org-secret-001" }));

    const res = await callSpaceGET();
    const body = await res.json();

    expect(res.status).toBe(403);
    const preview = body.space_preview;
    expect(preview.org_id).toBeUndefined();
  });

  it("space_preview 不包含 members 列表", async () => {
    mockGetTaskById.mockResolvedValue(makeSpace());
    mockGetTaskMembers.mockResolvedValue(makeMembers());

    const res = await callSpaceGET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.members).toBeUndefined();
    expect(body.space_preview.members).toBeUndefined();
  });

  it("space_preview 仅包含允许的字段（title, invite_mode, invite_code, member_count）", async () => {
    mockGetTaskById.mockResolvedValue(makeSpace());

    const res = await callSpaceGET();
    const body = await res.json();

    expect(res.status).toBe(403);
    const previewKeys = Object.keys(body.space_preview);
    const allowedKeys = ["title", "invite_mode", "invite_code", "member_count"];

    for (const key of previewKeys) {
      expect(allowedKeys).toContain(key);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 边界情况
// ═══════════════════════════════════════════════════════════════════════════════

describe("边界情况", () => {
  it("未登录用户访问空间 → 返回 401（不是 403）", async () => {
    mockGetUserFromRequest.mockResolvedValue(null);

    const res = await callSpaceGET();

    expect(res.status).toBe(401);
  });

  it("成员正常访问空间 → 返回 200（不受影响）", async () => {
    // Make user an active member
    mockGetTaskMemberRecord.mockResolvedValue({
      id: "tm-active-001",
      task_id: SPACE_ID,
      user_id: USER_ID,
      email: USER_EMAIL,
      role: "member",
      status: "active",
      joined_at: "2026-01-01T00:00:00Z",
    });
    mockGetTaskById.mockResolvedValue(makeSpace());
    mockGetTaskMembers.mockResolvedValue([
      ...makeMembers(),
      {
        id: "tm-active-001",
        task_id: SPACE_ID,
        user_id: USER_ID,
        email: USER_EMAIL,
        role: "member",
        status: "active",
        joined_at: "2026-01-01T00:00:00Z",
      },
    ]);

    const res = await callSpaceGET();

    expect(res.status).toBe(200);
    const body = await res.json();
    // 正常访问应返回 space 数据，不是 preview
    expect(body.space).toBeDefined();
    expect(body.space_preview).toBeUndefined();
  });
});
