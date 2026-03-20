/**
 * 笔记分享 — 验收测试（红队）
 *
 * 基于设计文档编写，不阅读蓝队实现代码。
 *
 * 设计文档约定：
 * 1. ai_todo_tasks 表新增 share_code TEXT 字段（8 位随机码）
 * 2. 分享/取消分享通过 PATCH /api/tasks/[id] 的 action: "share" / "unshare"
 * 3. 公开查询通过 GET /api/notes/shared/[code]（无需认证）
 * 4. 公开页面 /shared/[code] 展示 Markdown 渲染
 *
 * 验收标准：
 * AC-1: type=1 笔记可分享，返回 share_code + share_url
 * AC-2: 只有创建者可分享/取消分享
 * AC-3: type=0 任务不能分享
 * AC-4: 公开端点返回 title/description/tags/created_at，不返回 user_id/id
 * AC-5: 无效 code 或取消分享后返回 404
 * AC-6: 重复分享同一笔记返回相同 share_code（幂等）
 * AC-7: 取消分享清除 share_code
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

// ── mock db (initDb) ──────────────────────────────────────────────────────────

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    initDb: vi.fn().mockResolvedValue(undefined),
  };
});

// ── 测试常量 ──────────────────────────────────────────────────────────────────

const OWNER_ID = "user-owner-001";
const OWNER_EMAIL = "owner@example.com";
const OTHER_USER_ID = "user-other-002";
const OTHER_EMAIL = "other@example.com";
const NOTE_ID = "note-uuid-001";
const TASK_ID = "task-uuid-002";
const SHARE_CODE = "aBcDeFgH"; // 8 位随机码

function makeNote(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTE_ID,
    user_id: OWNER_ID,
    title: "测试笔记",
    description: "# 这是笔记内容\n\n用 Markdown 写的。",
    type: 1, // 笔记
    status: 0,
    priority: 2,
    tags: ["分享测试", "笔记"],
    created_at: new Date("2026-03-20T10:00:00.000Z"), // Date object (Postgres driver returns Date)
    share_code: null,
    space_id: null,
    assignee_id: null,
    parent_id: null,
    pinned: false,
    progress: 0,
    sort_order: 0,
    mentioned_emails: [],
    ...overrides,
  };
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    ...makeNote({ id: TASK_ID, title: "普通任务", type: 0, description: "任务描述" }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTaggedTemplate.mockReturnValue({ rows: [] });
  mockQuery.mockResolvedValue({ rows: [] });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-1: 分享笔记返回 share_code 和 share_url
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-1: 分享笔记返回 share_code 和 share_url", () => {
  it("PATCH /api/tasks/[id] with action:'share' → 返回 share_code 和 share_url", async () => {
    mockGetUserFromRequest.mockResolvedValue({ id: OWNER_ID, email: OWNER_EMAIL });

    // 第一次查询返回笔记（type=1, 无 share_code）
    mockTaggedTemplate.mockReturnValueOnce({
      rows: [makeNote()],
    });

    // UPDATE 返回带 share_code 的笔记
    mockTaggedTemplate.mockReturnValueOnce({
      rows: [makeNote({ share_code: SHARE_CODE })],
    });

    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const req = new NextRequest("https://ai-todo.stringzhao.life/api/tasks/" + NOTE_ID, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "share" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: NOTE_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.share_code).toBeDefined();
    expect(typeof body.share_code).toBe("string");
    expect(body.share_code.length).toBe(8);
    expect(body.share_url).toBeDefined();
    expect(typeof body.share_url).toBe("string");
    expect(body.share_url).toContain("/shared/");
    expect(body.share_url).toContain(body.share_code);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-2: 只有笔记创建者可以分享/取消分享
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-2: 只有笔记创建者可以分享", () => {
  it("非创建者分享笔记 → 返回 403", async () => {
    mockGetUserFromRequest.mockResolvedValue({ id: OTHER_USER_ID, email: OTHER_EMAIL });

    // 查询返回别人的笔记
    mockTaggedTemplate.mockReturnValueOnce({
      rows: [makeNote()],
    });

    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const req = new NextRequest("https://ai-todo.stringzhao.life/api/tasks/" + NOTE_ID, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "share" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: NOTE_ID }) });

    // 非创建者应被拒绝：403 或 401
    expect([401, 403]).toContain(res.status);
  });

  it("非创建者取消分享 → 返回 403", async () => {
    mockGetUserFromRequest.mockResolvedValue({ id: OTHER_USER_ID, email: OTHER_EMAIL });

    mockTaggedTemplate.mockReturnValueOnce({
      rows: [makeNote({ share_code: SHARE_CODE })],
    });

    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const req = new NextRequest("https://ai-todo.stringzhao.life/api/tasks/" + NOTE_ID, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unshare" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: NOTE_ID }) });

    expect([401, 403]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-3: 任务（type=0）不能分享
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-3: 任务（type=0）不能分享", () => {
  it("对 type=0 的任务执行 share → 返回 400", async () => {
    mockGetUserFromRequest.mockResolvedValue({ id: OWNER_ID, email: OWNER_EMAIL });

    mockTaggedTemplate.mockReturnValueOnce({
      rows: [makeTask()],
    });

    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const req = new NextRequest("https://ai-todo.stringzhao.life/api/tasks/" + TASK_ID, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "share" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: TASK_ID }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-4: 公开端点返回笔记内容，不返回敏感字段
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-4: 公开端点返回笔记内容", () => {
  it("GET /api/notes/shared/[code] → 返回 title/description/tags/created_at", async () => {
    const sharedNote = makeNote({ share_code: SHARE_CODE });
    mockTaggedTemplate.mockReturnValueOnce({
      rows: [sharedNote],
    });

    const { GET } = await import("@/app/api/notes/shared/[code]/route");
    const req = new NextRequest(
      `https://ai-todo.stringzhao.life/api/notes/shared/${SHARE_CODE}`
    );

    const res = await GET(req, { params: Promise.resolve({ code: SHARE_CODE }) });
    const body = await res.json();

    expect(res.status).toBe(200);

    // 必须返回的公开字段
    expect(body.title).toBe("测试笔记");
    expect(body.description).toBeDefined();
    expect(body.tags).toBeDefined();
    expect(Array.isArray(body.tags)).toBe(true);
    expect(body.created_at).toBeDefined();
  });

  it("公开端点不返回敏感字段（user_id/id）", async () => {
    const sharedNote = makeNote({ share_code: SHARE_CODE });
    mockTaggedTemplate.mockReturnValueOnce({
      rows: [sharedNote],
    });

    const { GET } = await import("@/app/api/notes/shared/[code]/route");
    const req = new NextRequest(
      `https://ai-todo.stringzhao.life/api/notes/shared/${SHARE_CODE}`
    );

    const res = await GET(req, { params: Promise.resolve({ code: SHARE_CODE }) });
    const body = await res.json();

    expect(res.status).toBe(200);

    // 不得泄露的敏感字段
    expect(body.user_id).toBeUndefined();
    expect(body.id).toBeUndefined();
  });

  it("公开端点无需认证即可访问", async () => {
    const sharedNote = makeNote({ share_code: SHARE_CODE });
    mockTaggedTemplate.mockReturnValueOnce({
      rows: [sharedNote],
    });

    const { GET } = await import("@/app/api/notes/shared/[code]/route");

    // 不带任何 auth header
    const req = new NextRequest(
      `https://ai-todo.stringzhao.life/api/notes/shared/${SHARE_CODE}`
    );

    const res = await GET(req, { params: Promise.resolve({ code: SHARE_CODE }) });

    // 应该成功返回，不要求认证
    expect(res.status).toBe(200);
    // getUserFromRequest 不应被调用
    expect(mockGetUserFromRequest).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-5: 无效 share_code 或取消分享后返回 404
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-5: 无效或失效的 share_code 返回 404", () => {
  it("无效 share_code → 返回 404", async () => {
    mockTaggedTemplate.mockReturnValueOnce({ rows: [] }); // 查不到

    const { GET } = await import("@/app/api/notes/shared/[code]/route");
    const req = new NextRequest(
      "https://ai-todo.stringzhao.life/api/notes/shared/INVALID1"
    );

    const res = await GET(req, { params: Promise.resolve({ code: "INVALID1" }) });

    expect(res.status).toBe(404);
  });

  it("取消分享后，原 share_code 查询返回 404", async () => {
    // 模拟 share_code 已被清除后的查询
    mockTaggedTemplate.mockReturnValueOnce({ rows: [] });

    const { GET } = await import("@/app/api/notes/shared/[code]/route");
    const req = new NextRequest(
      `https://ai-todo.stringzhao.life/api/notes/shared/${SHARE_CODE}`
    );

    const res = await GET(req, { params: Promise.resolve({ code: SHARE_CODE }) });

    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-6: 重复分享同一笔记返回相同 share_code（幂等）
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-6: 重复分享幂等", () => {
  it("已有 share_code 的笔记再次分享 → 返回相同的 share_code", async () => {
    mockGetUserFromRequest.mockResolvedValue({ id: OWNER_ID, email: OWNER_EMAIL });

    // 查询返回已经有 share_code 的笔记
    mockTaggedTemplate.mockReturnValueOnce({
      rows: [makeNote({ share_code: SHARE_CODE })],
    });

    // 幂等行为：可能不需要 UPDATE，直接返回已有 code
    // 也可能再做一次 UPDATE，返回同样的 code — 两种实现都可以
    mockTaggedTemplate.mockReturnValueOnce({
      rows: [makeNote({ share_code: SHARE_CODE })],
    });

    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const req = new NextRequest("https://ai-todo.stringzhao.life/api/tasks/" + NOTE_ID, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "share" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: NOTE_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.share_code).toBe(SHARE_CODE);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-7: 取消分享清除 share_code
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-7: 取消分享清除 share_code", () => {
  it("PATCH /api/tasks/[id] with action:'unshare' → share_code 被清除", async () => {
    mockGetUserFromRequest.mockResolvedValue({ id: OWNER_ID, email: OWNER_EMAIL });

    // 查询返回已分享的笔记
    mockTaggedTemplate.mockReturnValueOnce({
      rows: [makeNote({ share_code: SHARE_CODE })],
    });

    // UPDATE 清除 share_code 后返回
    mockTaggedTemplate.mockReturnValueOnce({
      rows: [makeNote({ share_code: null })],
    });

    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const req = new NextRequest("https://ai-todo.stringzhao.life/api/tasks/" + NOTE_ID, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unshare" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: NOTE_ID }) });

    expect(res.status).toBe(200);

    // 返回体中 share_code 应为 null 或不存在
    const body = await res.json();
    expect(body.share_code === null || body.share_code === undefined).toBe(true);
  });

  it("未登录用户无法取消分享 → 返回 401", async () => {
    mockGetUserFromRequest.mockResolvedValue(null);

    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const req = new NextRequest("https://ai-todo.stringzhao.life/api/tasks/" + NOTE_ID, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unshare" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: NOTE_ID }) });

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// share_code 格式验证
// ═══════════════════════════════════════════════════════════════════════════════

describe("share_code 格式", () => {
  it("share_code 应为 8 位字符（字母数字）", () => {
    // 根据设计文档：8 位随机码
    const code = SHARE_CODE;
    expect(code.length).toBe(8);
    expect(code).toMatch(/^[A-Za-z0-9]+$/);
  });

  it("share_url 格式应为 APP_ORIGIN/shared/{code}", () => {
    const expectedPattern = /^https?:\/\/.+\/shared\/[A-Za-z0-9]{8}$/;
    const exampleUrl = `https://ai-todo.stringzhao.life/shared/${SHARE_CODE}`;
    expect(exampleUrl).toMatch(expectedPattern);
  });
});
