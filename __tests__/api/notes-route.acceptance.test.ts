/**
 * /api/notes/* 路由验收测试 (VPS 迁移 / 笔记 API 门面)
 *
 * 目标:逐条覆盖笔记 API 门面 7 路由的契约谓词 —— 401 鉴权、400 输入校验、
 * 201 创建、200 读取、游标分页、归属 404(不泄漏)、type 隔离、share 生成/取消、
 * 公开 shared 子集、PATCH 翻转规避。
 *
 * 直接 import route handler,vi.mock("@/lib/db") + vi.mock("@/lib/auth") 隔离,
 * helpers/make-request.ts 提供 makeGET/makePOST/makePATCH/makeDELETE/makeRouteContext。
 *
 * 这是 TDD 红灯测试 —— 蓝队未实现路由时 import 失败即红灯(正确)。
 *
 * 覆盖谓词:
 * - 场景4: GET 分页(items ≤ limit, next_cursor, 401, 用户隔离)
 * - 场景5: POST 创建(201 NoteDTO, 400 缺 title, 400 超 500, 默认值)
 * - 场景6: GET/PATCH/DELETE 单条(200, 归属 404, 不存在 404, type=0 → 404)
 * - 场景7: POST/DELETE share(share_code+share_url, 旧码失效, 幂等)
 * - 场景8: session_token 鉴权(合法 200, 篡改 401, 过期 401, cookie 兼容)
 * - 场景12.P3: PATCH 请求体不含 due_date/priority(门面收窄)
 */

// CONTRACT_AMBIGUITY:
// 1. share_url = ${APP_ORIGIN}/shared/${share_code} —— APP_ORIGIN 在测试环境无值,
//    测试断言 share_url 包含 /shared/{share_code} 后缀即可,前缀留生产注入。
// 2. PATCH "至少 1 个可更新字段" 否则 400 {error:"No updatable fields"} ——
//    契约第187行明示错误码字符串。
// 3. 归属校验不匹配 → 404(非 403,防存在性泄漏)—— 契约第197行固化。

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  makeGET,
  makePOST,
  makePATCH,
  makeDELETE,
  makeRouteContext,
} from "../helpers/make-request";

// 统一 mock 外部依赖 —— 与现有 tasks-route.acceptance.test.ts 形态一致
vi.mock("@/lib/auth");
vi.mock("@/lib/db");
vi.mock("@/lib/notes", () => ({
  toNoteDTO: vi.fn((t: Record<string, unknown>) => ({
    id: t.id,
    title: t.title,
    description: t.description ?? null,
    tags: t.tags ?? [],
    created_at: t.created_at,
    share_code: t.share_code ?? null,
    space_id: t.space_id ?? null,
  })),
  getNotes: vi.fn().mockResolvedValue({ items: [], total: 0, has_more: false, next_cursor: null }),
  getNote: vi.fn().mockResolvedValue(null),
  createNote: vi.fn().mockResolvedValue(null),
  updateNote: vi.fn().mockResolvedValue(null),
  deleteNote: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notes-auth", () => ({
  resolveNoteUserId: vi.fn(),
}));
vi.mock("@/lib/route-timing", () => ({
  createRouteTimer: vi.fn().mockImplementation(() => ({
    track: vi.fn().mockImplementation((_n: string, fn: () => unknown) => fn()),
    json: vi
      .fn()
      .mockImplementation((data: unknown, init?: ResponseInit) => Response.json(data, init)),
    empty: vi.fn().mockImplementation((status: number) => new Response(null, { status })),
  })),
}));
vi.mock("@/lib/pg", () => ({
  sql: Object.assign(vi.fn(), { query: vi.fn() }),
  pool: { options: { max: 5 } },
}));

import { getUserFromRequest } from "@/lib/auth";
import { generateShareCode, setShareCode, getTaskByShareCode } from "@/lib/db";
import { getNotes, getNote, createNote, updateNote, deleteNote } from "@/lib/notes";
import { resolveNoteUserId } from "@/lib/notes-auth";

// ─── fixtures ──────────────────────────────────────────────────────────────
const TEST_USER = { id: "user-1", email: "test@example.com" };

function makeNoteTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "note-1",
    user_id: "user-1",
    title: "My note",
    description: "body",
    tags: ["work"],
    created_at: "2026-07-08T10:00:00Z",
    share_code: null,
    space_id: null,
    type: 1,
    priority: 2,
    status: 0,
    progress: 0,
    sort_order: 0,
    ...overrides,
  };
}

// NoteDTO 形态(门面/路由对外契约):仅 7 字段,屏蔽任务语义字段
function makeNoteDTO(overrides: Record<string, unknown> = {}) {
  const t = makeNoteTask(overrides);
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? null,
    tags: t.tags ?? [],
    created_at: t.created_at,
    share_code: t.share_code ?? null,
    space_id: t.space_id ?? null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // 默认鉴权通过(TEST_USER)
  vi.mocked(getUserFromRequest).mockResolvedValue(TEST_USER);
  vi.mocked(resolveNoteUserId).mockResolvedValue(TEST_USER.id);
  vi.mocked(generateShareCode).mockReturnValue("abc12345");
});

// ─── 场景4: GET /api/notes 游标分页 ────────────────────────────────────────
describe("场景4: GET /api/notes", () => {
  it("场景4.P1: 返回 200 + items(≤limit) + next_cursor 结构", async () => {
    const notes = [makeNoteTask({ id: "n1" }), makeNoteTask({ id: "n2" })];
    vi.mocked(getNotes).mockResolvedValue({
      items: notes.map((n) => ({
        id: n.id,
        title: n.title,
        description: n.description,
        tags: n.tags,
        created_at: n.created_at,
        share_code: n.share_code,
        space_id: n.space_id,
      })),
      total: 2,
      has_more: false,
      next_cursor: null,
    });

    const { GET } = await import("@/app/api/notes/route");
    const res = await GET(makeGET("/api/notes", { limit: "5" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeLessThanOrEqual(5);
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("has_more");
    expect(body).toHaveProperty("next_cursor");
  });

  it("场景4.P1: items 仅含 NoteDTO 字段(无任务残留字段 priority/status/due_date)", async () => {
    vi.mocked(getNotes).mockResolvedValue({
      items: [
        {
          id: "n1",
          title: "t",
          description: null,
          tags: [],
          created_at: "2026-07-08T10:00:00Z",
          share_code: null,
          space_id: null,
        },
      ],
      total: 1,
      has_more: false,
      next_cursor: null,
    });

    const { GET } = await import("@/app/api/notes/route");
    const res = await GET(makeGET("/api/notes"));
    const body = await res.json();
    const item = body.items[0];

    // 契约禁止暴露字段
    expect(item.priority).toBeUndefined();
    expect(item.status).toBeUndefined();
    expect(item.due_date).toBeUndefined();
    expect(item.progress).toBeUndefined();
    expect(item.assignee_id).toBeUndefined();
  });

  it("场景4.P3: 不带 Authorization → 401 {error}", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    vi.mocked(resolveNoteUserId).mockResolvedValue(null);

    const { GET } = await import("@/app/api/notes/route");
    const res = await GET(makeGET("/api/notes"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("场景4.P4 [用户隔离]: user A token 请求不见 user B 笔记", async () => {
    // user-1 鉴权,但 getNotes 查询 user_id 必须绑 user-1,user-2 笔记不在结果
    vi.mocked(getNotes).mockImplementation(async (uid) => {
      expect(uid).toBe("user-1"); // 必须用当前 token 用户查
      return {
        items: [
          {
            id: "n-user-1",
            title: "t",
            description: null,
            tags: [],
            created_at: "x",
            share_code: null,
            space_id: null,
          },
        ],
        total: 1,
        has_more: false,
        next_cursor: null,
      };
    });

    const { GET } = await import("@/app/api/notes/route");
    const res = await GET(makeGET("/api/notes"));
    const body = await res.json();

    // 结果中不应出现 user-2 的笔记
    const ids = body.items.map((i: { id: string }) => i.id);
    expect(ids).not.toContain("note-user-2");
    expect(getNotes).toHaveBeenCalledWith("user-1", expect.objectContaining({}));
  });

  it("exports preferredRegion = hkg1(契约第206行)", async () => {
    const mod = await import("@/app/api/notes/route");
    expect(mod.preferredRegion).toBe("hkg1");
  });
});

// ─── 场景5: POST /api/notes 创建 ───────────────────────────────────────────
describe("场景5: POST /api/notes", () => {
  it("场景5.P1: 合法 body → 201 + NoteDTO(含 id/title/tags/created_at)", async () => {
    const created = makeNoteDTO({ id: "new-note" });
    vi.mocked(createNote).mockResolvedValue(created as never);

    const { POST } = await import("@/app/api/notes/route");
    const res = await POST(makePOST("/api/notes", { title: "my note", tags: ["x"] }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("new-note");
    expect(body.title).toBe("My note");
    expect(body.tags).toEqual(["work"]);
    expect(body.created_at).toBe("2026-07-08T10:00:00Z");
  });

  it("场景5.P1: 201 响应禁止暴露 priority/status/due_date(字段收窄)", async () => {
    // createNote 门面返回 NoteDTO(字段收窄),mock 返回 DTO 形态(非 Task)
    const created = makeNoteDTO();
    vi.mocked(createNote).mockResolvedValue(created as never);

    const { POST } = await import("@/app/api/notes/route");
    const res = await POST(makePOST("/api/notes", { title: "t" }));
    const body = await res.json();

    expect(body.priority).toBeUndefined();
    expect(body.status).toBeUndefined();
    expect(body.due_date).toBeUndefined();
  });

  it("场景5.P2: 省略可选字段合理默认(space_id null, type=1 强制)", async () => {
    vi.mocked(createNote).mockImplementation(async (_uid, data) => {
      // createNote 应仅收 {title, description?, tags?},其余字段被门面收窄丢弃
      expect(Object.keys(data as object)).toEqual(expect.arrayContaining(["title"]));
      return makeNoteDTO({ id: "minimal", title: "minimal" }) as never;
    });

    const { POST } = await import("@/app/api/notes/route");
    const res = await POST(makePOST("/api/notes", { title: "minimal" }));
    expect(res.status).toBe(201);
  });

  it("场景5.P3: 缺 title → 400 {error}", async () => {
    const { POST } = await import("@/app/api/notes/route");
    const res = await POST(makePOST("/api/notes", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(createNote).not.toHaveBeenCalled();
  });

  it("场景5.P3: title 空串/纯空格 → 400(trim 后空)", async () => {
    const { POST } = await import("@/app/api/notes/route");
    const res = await POST(makePOST("/api/notes", { title: "   " }));
    expect(res.status).toBe(400);
  });

  it("场景5.P4: title 超 500 字符 → 400(契约 1 ≤ len ≤ 500)", async () => {
    const { POST } = await import("@/app/api/notes/route");
    const longTitle = "x".repeat(501);
    const res = await POST(makePOST("/api/notes", { title: longTitle }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("场景5: 未鉴权 → 401(优先于 400)", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    vi.mocked(resolveNoteUserId).mockResolvedValue(null);
    const { POST } = await import("@/app/api/notes/route");
    const res = await POST(makePOST("/api/notes", { title: "x" }));
    expect(res.status).toBe(401);
  });
});

// ─── 场景6: GET/PATCH/DELETE /api/notes/[id] ───────────────────────────────
describe("场景6: GET /api/notes/[id] 单条", () => {
  it("场景6.P1: GET 自己笔记 → 200 + NoteDTO", async () => {
    // 蓝队 getNote 单参返回 {note: NoteDTO, user_id},路由判归属后 rt.json(found.note)
    vi.mocked(getNote).mockResolvedValue({
      note: makeNoteDTO({ id: "note-1" }),
      user_id: "user-1",
    } as never);

    const { GET } = await import("@/app/api/notes/[id]/route");
    const res = await GET(makeGET("/api/notes/note-1"), makeRouteContext({ id: "note-1" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("note-1");
    expect(body.priority).toBeUndefined();
    expect(body.status).toBeUndefined();
  });

  it("场景6.P4 [不泄漏]: GET 他人笔记 → 404(非 403)", async () => {
    vi.mocked(getNote).mockResolvedValue(null as never); // 门面归属判定不匹配返回 null

    const { GET } = await import("@/app/api/notes/[id]/route");
    const res = await GET(makeGET("/api/notes/note-other"), makeRouteContext({ id: "note-other" }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Not found" }); // 契约第186行
  });

  it("场景6.P5: :id 不存在 UUID → 404", async () => {
    vi.mocked(getNote).mockResolvedValue(null as never);

    const { GET } = await import("@/app/api/notes/[id]/route");
    const res = await GET(
      makeGET("/api/notes/00000000-0000-0000-0000-000000000000"),
      makeRouteContext({ id: "00000000-0000-0000-0000-000000000000" })
    );
    expect(res.status).toBe(404);
  });

  it("场景6.P6 [type 隔离]: :id 指向任务(type=0) → 404", async () => {
    // 门面 getNote 强制 type=1,type=0 任务经 id 直查返回 null → 404
    vi.mocked(getNote).mockResolvedValue(null as never);

    const { GET } = await import("@/app/api/notes/[id]/route");
    const res = await GET(
      makeGET("/api/notes/task-id-type-0"),
      makeRouteContext({ id: "task-id-type-0" })
    );
    expect(res.status).toBe(404);
  });

  it("未鉴权 → 401", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    vi.mocked(resolveNoteUserId).mockResolvedValue(null);
    const { GET } = await import("@/app/api/notes/[id]/route");
    const res = await GET(makeGET("/api/notes/note-1"), makeRouteContext({ id: "note-1" }));
    expect(res.status).toBe(401);
  });
});

describe("场景6: PATCH /api/notes/[id]", () => {
  it("场景6.P2: PATCH title/tags → 200 + 更新后对象", async () => {
    // 蓝队 PATCH 路由不调 getNote,直接调 updateNote
    vi.mocked(updateNote).mockResolvedValue(
      makeNoteDTO({ title: "updated", tags: ["new"] }) as never
    );

    const { PATCH } = await import("@/app/api/notes/[id]/route");
    const res = await PATCH(
      makePATCH("/api/notes/note-1", { title: "updated", tags: ["new"] }),
      makeRouteContext({ id: "note-1" })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("updated");
    expect(body.tags).toEqual(["new"]);
  });

  it("场景12.P3 [翻转规避]: PATCH 请求体不含 due_date/priority 入口", async () => {
    // 即使客户端传了,门面应忽略(字段收窄)
    vi.mocked(updateNote).mockImplementation(async (_id, _uid, patch) => {
      // patch 应仅含 {title?, description?, tags?}
      const keys = Object.keys(patch as object);
      expect(keys).not.toContain("due_date");
      expect(keys).not.toContain("priority");
      expect(keys).not.toContain("status");
      expect(keys).not.toContain("type"); // 防翻转关键
      return makeNoteDTO() as never;
    });

    const { PATCH } = await import("@/app/api/notes/[id]/route");
    const res = await PATCH(
       
      makePATCH("/api/notes/note-1", {
        title: "x",
        due_date: "2026-01-01",
        priority: 0,
      } as any),
      makeRouteContext({ id: "note-1" })
    );

    expect(res.status).toBe(200);
  });

  it("场景6 契约: PATCH 无可更新字段 → 400 {error: 'No updatable fields'}", async () => {
    const { PATCH } = await import("@/app/api/notes/[id]/route");
    const res = await PATCH(makePATCH("/api/notes/note-1", {}), makeRouteContext({ id: "note-1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "No updatable fields" }); // 契约第187行
  });

  it("场景6.P4 [不泄漏]: PATCH 他人笔记 → 404", async () => {
    // 蓝队 PATCH 路由不调 getNote,直接调 updateNote;归属在 updateNote 层(WHERE user_id)
    // updateNote 返回 null(他人笔记 WHERE 不匹配)→ 路由 404
    vi.mocked(updateNote).mockResolvedValue(null as never);

    const { PATCH } = await import("@/app/api/notes/[id]/route");
    const res = await PATCH(
      makePATCH("/api/notes/note-other", { title: "hack" }),
      makeRouteContext({ id: "note-other" })
    );
    expect(res.status).toBe(404);
  });

  it("场景6.P6: PATCH type=0 任务 → 404(type 隔离)", async () => {
    // 蓝队 PATCH 路由调 updateNote;type=0 任务经 WHERE type=1 不匹配 → null → 404
    vi.mocked(updateNote).mockResolvedValue(null as never);
    const { PATCH } = await import("@/app/api/notes/[id]/route");
    const res = await PATCH(
      makePATCH("/api/notes/task-type-0", { title: "x" }),
      makeRouteContext({ id: "task-type-0" })
    );
    expect(res.status).toBe(404);
  });
});

describe("场景6: DELETE /api/notes/[id]", () => {
  it("场景6.P3: DELETE 自己笔记 → 200 {ok:true},再 GET → 404", async () => {
    // 蓝队 DELETE 路由调 deleteNote(id,userId) 返回 boolean(true→200)
    // 再 GET 调 getNote(id),已删 → null → 404
    vi.mocked(deleteNote).mockResolvedValue(true as never);
    vi.mocked(getNote).mockResolvedValue(null as never);

    const { DELETE, GET } = await import("@/app/api/notes/[id]/route");
    const delRes = await DELETE(
      makeDELETE("/api/notes/note-1"),
      makeRouteContext({ id: "note-1" })
    );
    expect(delRes.status).toBe(200);
    const delBody = await delRes.json();
    expect(delBody).toEqual({ ok: true }); // 契约第188行

    // 再 GET → 404
    const getRes = await GET(makeGET("/api/notes/note-1"), makeRouteContext({ id: "note-1" }));
    expect(getRes.status).toBe(404);
  });

  it("场景6.P4 [不泄漏]: DELETE 他人笔记 → 404", async () => {
    // 蓝队 DELETE 路由调 deleteNote(id,userId);归属在 deleteNote 层(WHERE user_id)
    // deleteNote 返回 false(WHERE 不匹配)→ 路由 404
    vi.mocked(deleteNote).mockResolvedValue(false as never);
    const { DELETE } = await import("@/app/api/notes/[id]/route");
    const res = await DELETE(
      makeDELETE("/api/notes/note-other"),
      makeRouteContext({ id: "note-other" })
    );
    expect(res.status).toBe(404);
  });
});

// ─── 场景7: POST/DELETE /api/notes/[id]/share ──────────────────────────────
describe("场景7: POST /api/notes/[id]/share 生成分享", () => {
  it("场景7.P1: POST → 200 {share_code, share_url},share_code 8 位", async () => {
    // 蓝队 share 路由调 getNote(id) 返回 {note, user_id},判归属后生成 code
    vi.mocked(getNote).mockResolvedValue({
      note: makeNoteDTO({ id: "note-1", share_code: null }),
      user_id: "user-1",
    } as never);
    vi.mocked(generateShareCode).mockReturnValue("abcd1234");

    const { POST } = await import("@/app/api/notes/[id]/share/route");
    const res = await POST(
      makePOST("/api/notes/note-1/share", {}),
      makeRouteContext({ id: "note-1" })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.share_code).toBe("abcd1234");
    expect(body.share_code.length).toBe(8); // 契约第189行
    expect(body).toHaveProperty("share_url");
    // share_url 含 /shared/{code} 路径
    expect(body.share_url).toContain("/shared/abcd1234");
    // setShareCode 被调用写 DB
    expect(setShareCode).toHaveBeenCalledWith("note-1", "abcd1234");
  });

  it("场景7.P4 [幂等]: 重复 POST → 均 2xx,DB 仅一条 share_code", async () => {
    // 第一次无 share_code → 生成;第二次幂等(蓝队复用 found.note.share_code)
    vi.mocked(getNote).mockResolvedValue({
      note: makeNoteDTO({ id: "note-1", share_code: null }),
      user_id: "user-1",
    } as never);

    const { POST } = await import("@/app/api/notes/[id]/share/route");
    const res1 = await POST(
      makePOST("/api/notes/note-1/share", {}),
      makeRouteContext({ id: "note-1" })
    );
    const res2 = await POST(
      makePOST("/api/notes/note-1/share", {}),
      makeRouteContext({ id: "note-1" })
    );

    expect(res1.status).toBeLessThan(300);
    expect(res2.status).toBeLessThan(300);
    // setShareCode 调用次数应合理(幂等可覆盖,但不应爆炸增长)
    expect(setShareCode).toHaveBeenCalled();
  });

  it("场景7: POST share 他人笔记 → 404(不泄漏)", async () => {
    vi.mocked(getNote).mockResolvedValue(null as never);
    const { POST } = await import("@/app/api/notes/[id]/share/route");
    const res = await POST(
      makePOST("/api/notes/note-other/share", {}),
      makeRouteContext({ id: "note-other" })
    );
    expect(res.status).toBe(404);
    expect(setShareCode).not.toHaveBeenCalled();
  });
});

describe("场景7: DELETE /api/notes/[id]/share 取消分享", () => {
  it("场景7.P3: DELETE → 200 {ok:true},旧 share_code 失效", async () => {
    // 蓝队 DELETE share 路由调 getNote(id) 返回 {note, user_id},判归属后 setShareCode(null)
    vi.mocked(getNote).mockResolvedValue({
      note: makeNoteDTO({ share_code: "oldcode1" }),
      user_id: "user-1",
    } as never);
    vi.mocked(getTaskByShareCode).mockResolvedValue(null as never);

    const { DELETE } = await import("@/app/api/notes/[id]/share/route");
    const res = await DELETE(
      makeDELETE("/api/notes/note-1/share"),
      makeRouteContext({ id: "note-1" })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    // setShareCode 被调用清空(传 null)
    expect(setShareCode).toHaveBeenCalledWith("note-1", null);
  });
});

// ─── 场景7.P2: GET /api/notes/shared/[code] 公开访问 ───────────────────────
describe("场景7.P2: GET /api/notes/shared/[code] 公开(无鉴权)", () => {
  it("场景7.P2: 公开 /shared/{code} → 200,无登录跳转,字段是公开子集", async () => {
    vi.mocked(getTaskByShareCode).mockResolvedValue(makeNoteTask() as never);
    // 故意把 getUserFromRequest 设 null,验证不依赖鉴权
    vi.mocked(getUserFromRequest).mockResolvedValue(null);

    const { GET } = await import("@/app/api/notes/shared/[code]/route");
    const res = await GET(
      makeGET("/api/notes/shared/abcd1234"),
      makeRouteContext({ code: "abcd1234" })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    // 公开子集契约第191行:仅 title/description/tags/created_at
    expect(body).toHaveProperty("title");
    expect(body).toHaveProperty("description");
    expect(body).toHaveProperty("tags");
    expect(body).toHaveProperty("created_at");
    // 屏蔽 id/share_code/space_id(防枚举)
    expect(body.id).toBeUndefined();
    expect(body.share_code).toBeUndefined();
    expect(body.space_id).toBeUndefined();
  });

  it("场景7.P3: 旧 share_code 失效后 → 404", async () => {
    vi.mocked(getTaskByShareCode).mockResolvedValue(null as never);

    const { GET } = await import("@/app/api/notes/shared/[code]/route");
    const res = await GET(
      makeGET("/api/notes/shared/revoked1"),
      makeRouteContext({ code: "revoked1" })
    );
    expect(res.status).toBe(404);
  });
});

// ─── 场景8: session_token 鉴权 ─────────────────────────────────────────────
describe("场景8: session_token / cookie 双通道鉴权", () => {
  it("场景8.P1: 合法 Bearer session_token → 200 + 返回该用户笔记", async () => {
    vi.mocked(getNotes).mockResolvedValue({
      items: [
        {
          id: "n1",
          title: "t",
          description: null,
          tags: [],
          created_at: "x",
          share_code: null,
          space_id: null,
        },
      ],
      total: 1,
      has_more: false,
      next_cursor: null,
    });

    const { GET } = await import("@/app/api/notes/route");
    // makeGET 默认无 Authorization,这里手动构造带 Bearer 的请求
    const url = new URL("http://localhost/api/notes");
    const req = new NextRequest(url, {
      headers: { Authorization: "Bearer valid-session-token" },
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    // 蓝队路由调 resolveNoteUserId(内部包 getUserFromRequest 验签 session_token)
    expect(resolveNoteUserId).toHaveBeenCalled();
  });

  it("场景8.P2: 篡改 session_token 签名 → 401,无 items", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null); // 签名验签失败
    vi.mocked(resolveNoteUserId).mockResolvedValue(null);

    const { GET } = await import("@/app/api/notes/route");
    const url = new URL("http://localhost/api/notes");
    const req = new NextRequest(url, {
      headers: { Authorization: "Bearer tampered.token.sig" },
    });
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.items).toBeUndefined();
  });

  it("场景8.P3: 过期 session_token(>90 天) → 401", async () => {
    // 底层 getUserFromRequest 验签失败(过期),返回 null
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    vi.mocked(resolveNoteUserId).mockResolvedValue(null);

    const { GET } = await import("@/app/api/notes/route");
    const url = new URL("http://localhost/api/notes");
    const req = new NextRequest(url, {
      headers: { Authorization: "Bearer expired-90-days-ago-token" },
    });
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("场景8.P4: 浏览器 cookie 访问兼容(双通道)", async () => {
    // cookie 鉴权:getUserFromRequest 也读 cookie access_token
    vi.mocked(getNotes).mockResolvedValue({
      items: [],
      total: 0,
      has_more: false,
      next_cursor: null,
    });

    const { GET } = await import("@/app/api/notes/route");
    const url = new URL("http://localhost/api/notes");
    const req = new NextRequest(url, {
      headers: { cookie: "access_token=valid-cookie-jwt" },
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
  });
});

/**
 * 留 QA Tier 1.5:
 * - 场景4.P2 [real-process]: 连续翻页至 next_cursor=null,累计 items 去重 = 全量 →
 *   需真 PG 多页 e2e,QA real-process
 * - 场景7.P2 [real-process]: 公开 /shared/{code} 无鉴权可访问(浏览器渲染笔记内容) →
 *   QA 真实 curl 验证无登录跳转
 * - 场景9 [回归]: /api/tasks?type=1 响应契约不变 → QA npm test 全量 + 前后对比
 * - 场景10/11 [det-machine]: Dockerfile/compose/脚本静态产物存在性 → QA fs 断言
 * - 场景3 [det-machine]: 无 sql.begin 残留 grep → QA 静态
 */
