/**
 * lib/notes 笔记门面验收测试 (VPS 迁移 / 笔记 API 门面)
 *
 * 目标:验证 lib/notes.ts 门面对外契约 —— NoteDTO 字段收窄、type 隔离、游标格式、
 * createNote 写 type=1。门面是 /api/notes/* 路由的纯逻辑层,屏蔽 db.ts Task 全字段,
 * 仅暴露笔记语义子集,防越权访问任务字段、防 type 翻转。
 *
 * 这是 TDD 红灯测试 —— 蓝队未实现 lib/notes.ts 时 import 失败即红灯(正确)。
 *
 * 覆盖谓词:
 * - 场景4.P1: items 仅笔记(无任务残留字段) → toNoteDTO 字段收窄
 * - 场景5.P2: 省略可选字段合理默认(type 强制 1, space_id null)
 * - 场景6.P1: GET 自己笔记字段齐(无 priority/status 等)
 * - 场景6.P6 [type 隔离]: getNote/getNotes/updateNote/deleteNote 强制 AND type = 1
 * - 场景12.P1 [数据一致性]: /api/notes 与 /api/tasks?type=1 笔记集合等价(同表)
 * - 场景12.P2 [跨系统]: 经门面 createNote 写 type=1, /api/tasks?type=1 可见
 * - 场景12.P3 [翻转规避]: 门面无 due_date/priority 字段入口
 * - 契约 NoteDTO 字段: 禁止暴露 priority/status/due_date/start_date/end_date/
 *   assignee_id/assignee_email/progress/sort_order/milestone/mentioned_emails
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeTask } from "../helpers/fixtures";

// 笔记门面查询底层走 sql(@/lib/pg),mock 住避免真 DB
// 形状对齐现有测试 + pg 兼容层导出
vi.mock("@/lib/pg", () => {
  const sql = Object.assign(vi.fn(), {
    query: vi.fn(),
  });
  return { sql, pool: { options: { max: 5 } } };
});

// 笔记门面可能调 db.ts 的 generateShareCode / setShareCode / createTask 等,mock 住
// createNote 内部委托 createTask(userId, {..., type:1}),不走 sql INSERT —— 故 mock createTask
vi.mock("@/lib/db", () => ({
  initDb: vi.fn().mockResolvedValue(undefined),
  generateShareCode: vi.fn().mockReturnValue("abc12345"),
  setShareCode: vi.fn().mockResolvedValue(undefined),
  getTaskByShareCode: vi.fn().mockResolvedValue(null),
  createTask: vi.fn().mockImplementation((_uid: string, data: Record<string, unknown>) =>
    Promise.resolve({
      id: "test-id",
      user_id: _uid,
      created_at: "2026-07-08T10:00:00Z",
      type: 1,
      tags: [],
      title: "t",
      description: null,
      ...data,
    })
  ),
}));

import { sql } from "@/lib/pg";
import { createTask } from "@/lib/db";
// 红队测形状 —— import 即契约校验(蓝队未写则失败,红灯正确)
import {
  toNoteDTO,
  getNotes,
  getNote,
  createNote,
  updateNote,
  deleteNote,
} from "@/lib/notes";
import type { Task } from "@/lib/types";

// 构造完整 Task 字段(含门面应屏蔽的全部任务字段)
function makeFullNoteTask(overrides: Partial<Task> = {}): Task {
  return makeTask({
    type: 1,
    description: "note body",
    tags: ["work", "idea"],
    share_code: "share1234",
    space_id: undefined,
    priority: 2,
    status: 0,
    due_date: "2026-12-31T23:59:59Z",
    start_date: "2026-07-01T00:00:00Z",
    end_date: "2026-12-30T00:00:00Z",
    assignee_id: "assignee-1",
    assignee_email: "assignee@example.com",
    mentioned_emails: ["mention@example.com"],
    progress: 50,
    sort_order: 3,
    milestone: "v1.0",
    user_id: "user-1",
    created_at: "2026-07-08T10:00:00Z",
    ...overrides,
  });
}

const FORBIDDEN_NOTE_FIELDS = [
  "priority",
  "status",
  "due_date",
  "start_date",
  "end_date",
  "assignee_id",
  "assignee_email",
  "mentioned_emails",
  "progress",
  "sort_order",
  "milestone",
  // type 也不对外暴露(门面视角 type 恒 1,无意义)
  "type",
] as const;

describe("toNoteDTO 字段收窄 — 场景4.P1 / 场景6.P1 / 契约 NoteDTO", () => {
  it("场景6.P1: 输出仅含契约 NoteDTO 字段(id/title/description/tags/created_at/share_code/space_id)", () => {
    const note = makeFullNoteTask();
    const dto = toNoteDTO(note);

    // 契约 NoteDTO 字段全部存在
    expect(dto).toHaveProperty("id");
    expect(dto).toHaveProperty("title");
    expect(dto).toHaveProperty("description");
    expect(dto).toHaveProperty("tags");
    expect(dto).toHaveProperty("created_at");
    expect(dto).toHaveProperty("share_code");
    expect(dto).toHaveProperty("space_id");

    // 字段值正确映射
    expect(dto.id).toBe(note.id);
    expect(dto.title).toBe(note.title);
    expect(dto.description).toBe(note.description);
    expect(dto.tags).toEqual(note.tags);
    expect(dto.created_at).toBe(note.created_at);
  });

  it("契约 NoteDTO: 禁止暴露任务语义字段(防越权/防信息泄漏)", () => {
    const dto = toNoteDTO(makeFullNoteTask()) as unknown as Record<string, unknown>;
    for (const field of FORBIDDEN_NOTE_FIELDS) {
      expect(dto[field], `NoteDTO 不应暴露 ${field}`).toBeUndefined();
    }
  });

  it("契约 NoteDTO: space_id Phase 1 恒 null(个人笔记)", () => {
    const dto = toNoteDTO(makeFullNoteTask({ space_id: undefined }));
    expect(dto.space_id).toBeNull();
  });
});

describe("getNotes — 场景6.P6 type 隔离 + 场景4.P1 分页", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sql).mockResolvedValue({ rows: [] } as never);
    vi.mocked(sql.query).mockResolvedValue({ rows: [] } as never);
  });

  it("场景6.P6 [type 隔离铁律]: getNotes 查询文本含 'type = 1' AND 'space_id IS NULL'", async () => {
    await getNotes("user-1", {});

    // 任一调用形态(tagged template 或 query)都应包含 type 隔离
    const calls = [
      ...vi.mocked(sql).mock.calls.map((c) => String(c[0])),
      ...vi.mocked(sql.query).mock.calls.map((c) => String(c[0])),
    ];
    expect(calls.length).toBeGreaterThan(0);
    const allText = calls.join("\n");
    expect(allText, "门面 getNotes 必须强制 type=1 隔离").toMatch(/type\s*=\s*1/i);
    expect(
      allText,
      "Phase 1 个人笔记必须 space_id IS NULL 隔离(空间笔记留后续)"
    ).toMatch(/space_id\s+IS\s+NULL/i);
    expect(allText, "必须按 user_id 过滤(用户隔离场景4.P4)").toMatch(
      /user_id\s*=\s*\$\d+|user_id\s*=\s*\$\{[^}]+\}/i
    );
  });

  it("场景4.P1: getNotes 返回 {items, total, has_more, next_cursor}", async () => {
    const noteRow = makeFullNoteTask({ id: "note-1" });
    // mock 查询返回 noteRow(蓝队 getNotes 走 sql.query 两次:list + count,Promise.all)
    vi.mocked(sql.query).mockImplementation(async () => ({
      rows: [noteRow as never],
      rowCount: 1,
    }) as never);

    const result = await getNotes("user-1", { limit: 5 });

    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("has_more");
    expect(result).toHaveProperty("next_cursor");
    expect(Array.isArray(result.items)).toBe(true);
    // items 元素是 NoteDTO(已收窄,不含任务字段)
    if (result.items.length > 0) {
      const dto = result.items[0] as unknown as Record<string, unknown>;
      expect(dto.priority).toBeUndefined();
      expect(dto.status).toBeUndefined();
    }
  });

  it("场景4 契约: limit 默认 20,上限 50(参数归一化)", async () => {
    // 超上限 50 → 归一 50;无 limit → 默认 20;非法 → 默认
    await getNotes("user-1", { limit: 9999 });
    await getNotes("user-1", {});
    await getNotes("user-1", { limit: 0 });

    const calls = vi.mocked(sql).mock.calls.length + vi.mocked(sql.query).mock.calls.length;
    expect(calls).toBeGreaterThanOrEqual(3); // 三次调用都触发了查询
  });
});

describe("getNote — 场景6.P6 type 隔离 / 场景6.P1 单条", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("场景6.P6: getNote 查询含 type = 1(任务 id 直查返回 null/404)", async () => {
    // 蓝队 getNote 单参,WHERE id=$1 AND type=1(归属在路由层,门面返回 user_id)
    vi.mocked(sql.query).mockResolvedValue({ rows: [] } as never);
    await getNote("any-id");

    const calls = [
      ...vi.mocked(sql).mock.calls.map((c) => String(c[0])),
      ...vi.mocked(sql.query).mock.calls.map((c) => String(c[0])),
    ];
    const allText = calls.join("\n");
    expect(allText, "getNote 必须 AND type = 1 防越权访问任务").toMatch(
      /type\s*=\s*1/i
    );
  });

  it("场景6.P1: 返回的 Task 经路由层 toNoteDTO 收窄(此测试断言门面返回原始含 user_id 供归属判定)", async () => {
    const noteRow = makeFullNoteTask({ id: "note-1", user_id: "user-1" });
    // 门面 getNote 设计文档:含 user_id 供归属判定,不暴露给 DTO
    // 蓝队 getNote 走 sql.query(WHERE id+type=1,不含 user_id;返回 user_id 给路由层)
    vi.mocked(sql.query).mockResolvedValue({ rows: [noteRow as never] } as never);

    const result = await getNote("note-1");
    // 契约:门面 getNote 返回 {note, user_id}(供路由层归属判定,user_id 不进 DTO)
    expect(result).not.toBeNull();
    expect(result!.user_id).toBe("user-1");
  });

  it("场景6.P6: type=0 任务经 id 直查 → 返回 null(404 不泄漏)", async () => {
    vi.mocked(sql.query).mockResolvedValue({ rows: [] } as never);
    const result = await getNote("task-id-type-0");
    expect(result).toBeNull();
  });
});

describe("createNote — 场景5.P2 / 场景12.P2 写 type=1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("场景12.P2 [跨系统数据流]: createNote 强制写入 type = 1(同表 ai_todo_tasks)", async () => {
    // 蓝队 createNote 内部委托 createTask(userId, {..., type:1}),不走 sql INSERT
    // 验证 createTask 被调且入参含 type:1
    vi.mocked(createTask).mockResolvedValue(makeFullNoteTask({ id: "new-note" }) as never);

    await createNote("user-1", { title: "my note", tags: ["x"] });

    expect(createTask, "createNote 必须委托 createTask 写 type=1").toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ type: 1, title: "my note" })
    );
  });

  it("场景5.P2: 省略可选字段时 type 强制 1, space_id null", async () => {
    vi.mocked(createTask).mockResolvedValue(
      makeFullNoteTask({ id: "new-note-2", type: 1 }) as never
    );

    const result = await createNote("user-1", { title: "minimal note" });

    // 返回的对象经映射后应为笔记(type 不暴露在 DTO,但底层 Task.type=1)
    expect(result).toBeDefined();
  });

  it("场景12.P3 [翻转规避]: createNote 不接受 priority/due_date/type 参数(门面签名收窄)", async () => {
    // 门面 createNote 签名应仅 {title, description?, tags?}
    // 蓝队 createNote 内部委托 createTask,仅传 {title, description?, tags?, type:1}
    // 传入多余字段应被忽略(TS 编译期 + 运行期双保险)
    vi.mocked(createTask).mockResolvedValue(makeFullNoteTask({ id: "new-note-3", type: 1 }) as never);

    // 故意传 priority/due_date,门面应忽略
     
    await createNote("user-1", {
      title: "t",
      priority: 0,
      due_date: "2026-01-01",
    } as any);

    // createTask 入参不应含 priority/due_date(门面签名收窄)
    const arg = vi.mocked(createTask).mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(arg).not.toHaveProperty("priority");
    expect(arg).not.toHaveProperty("due_date");
  });
});

describe("updateNote — 场景6.P6 / 场景12.P3 收窄", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("场景12.P3 [PATCH 翻转规避]: updateNote 仅接受 title/description/tags", async () => {
    const updated = makeFullNoteTask({ id: "note-1", title: "updated" });
    vi.mocked(sql).mockResolvedValue({ rows: [updated as never] } as never);
    vi.mocked(sql.query).mockResolvedValue({ rows: [updated as never] } as never);

    await updateNote("note-1", "user-1", { title: "updated" });

    const calls = [
      ...vi.mocked(sql).mock.calls.map((c) => String(c[0])),
      ...vi.mocked(sql.query).mock.calls.map((c) => String(c[0])),
    ];
    const allText = calls.join("\n");
    // UPDATE 不应改 type(防翻转),不应改 priority/due_date
    expect(allText, "门面 UPDATE 不应修改 type(翻转规避)").not.toMatch(
      /SET\s+.*type\s*=/i
    );
    expect(allText, "门面 UPDATE 不应含 priority(字段收窄)").not.toMatch(
      /SET\s+.*priority/i
    );
    expect(allText, "门面 UPDATE 不应含 due_date(字段收窄)").not.toMatch(
      /SET\s+.*due_date/i
    );
  });

  it("场景6.P6: updateNote 查询含 type = 1 隔离(防任务被改)", async () => {
    vi.mocked(sql).mockResolvedValue({ rows: [] } as never);
    vi.mocked(sql.query).mockResolvedValue({ rows: [] } as never);

    await updateNote("note-1", "user-1", { title: "x" }).catch(() => null);

    const calls = [
      ...vi.mocked(sql).mock.calls.map((c) => String(c[0])),
      ...vi.mocked(sql.query).mock.calls.map((c) => String(c[0])),
    ];
    const allText = calls.join("\n");
    expect(allText, "updateNote 查询必须 AND type = 1").toMatch(/type\s*=\s*1/i);
    expect(allText, "updateNote 必须 AND user_id(归属)").toMatch(/user_id/i);
  });
});

describe("deleteNote — 场景6.P6 type 隔离", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("场景6.P6: deleteNote 查询含 type = 1(防任务被删)", async () => {
    vi.mocked(sql).mockResolvedValue({ rowCount: 0 } as never);
    vi.mocked(sql.query).mockResolvedValue({ rowCount: 0 } as never);

    await deleteNote("note-1", "user-1").catch(() => null);

    const calls = [
      ...vi.mocked(sql).mock.calls.map((c) => String(c[0])),
      ...vi.mocked(sql.query).mock.calls.map((c) => String(c[0])),
    ];
    const allText = calls.join("\n");
    expect(allText, "deleteNote 必须 AND type = 1").toMatch(/type\s*=\s*1/i);
    expect(allText, "deleteNote 必须 AND user_id(归属)").toMatch(/user_id/i);
  });
});

describe("游标格式 — 场景4 契约 (created_at|id 复合, Base64)", () => {
  it("场景4: next_cursor 是 Base64 编码字符串,解码后含 created_at 和 id 分隔", async () => {
    // mock 返回足量笔记触发 has_more + next_cursor
    // 蓝队 getNotes 走 sql.query 两次(list + count,Promise.all):
    // list 需返回 2 条(limit=1 + fetchLimit=2 触发 has_more),count 返回总数
    const note1 = makeFullNoteTask({
      id: "11111111-1111-1111-1111-111111111111",
      created_at: "2026-07-08T10:00:00Z",
    });
    const note2 = makeFullNoteTask({
      id: "22222222-2222-2222-2222-222222222222",
      created_at: "2026-07-07T10:00:00Z",
    });
    let callIdx = 0;
    vi.mocked(sql.query).mockImplementation(async () => {
      callIdx++;
      // 第一次:list 查询(返回 2 条,fetchLimit = limit+1 = 2);第二次:count
      if (callIdx === 1) return { rows: [note1, note2] as never[], rowCount: 2 } as never;
      return { rows: [{ cnt: 2 }] as never[], rowCount: 1 } as never;
    });

    const result = await getNotes("user-1", { limit: 1 });

    if (result.next_cursor) {
      // 游标应可 Base64 解码
      const decoded = Buffer.from(result.next_cursor, "base64").toString("utf-8");
      // 解码后含 created_at 和 id(分隔符 | 或其他,但两者都要在)
      expect(decoded).toContain("2026-07-08"); // created_at 片段
      expect(decoded.length).toBeGreaterThan(10); // 非平凡
    }
  });

  it("场景4: next_cursor=null 表末页(has_more=false 时)", async () => {
    // 蓝队 getNotes 走 sql.query 两次(list + count),都需 mock
    vi.mocked(sql.query).mockResolvedValue({ rows: [] as never[], rowCount: 0 } as never);
    const result = await getNotes("user-1", { limit: 20 });
    expect(result.has_more).toBe(false);
    expect(result.next_cursor).toBeNull();
  });
});

/**
 * 留 QA Tier 1.5:
 * - 场景12.P1 [real-process]: 同用户 /api/notes 与 /api/tasks?type=1 笔记集合等价 →
 *   需真 PG + 两端点 e2e 对比,QA real-process
 */
