import { sql } from "@/lib/pg";
import { createTask } from "@/lib/db";
import type { Task } from "@/lib/types";

/**
 * 笔记 API 门面层。
 *
 * 共用 ai_todo_tasks 表(type=1 区分笔记),通过 NoteDTO 收窄对外字段,
 * 屏蔽任务语义字段(priority/status/due_date/assignee 系列/progress/sort_order/milestone 等)。
 *
 * type 隔离铁律:getNote/getNotes/updateNote/deleteNote 所有查询强制 AND type = 1。
 * type=0(任务)在门面视角等同「不存在」→ 路由层返回 404(不泄漏存在性)。
 *
 * Phase 1:仅个人笔记(space_id IS NULL)。多人共享(space_id 非空)留 Phase 2。
 */

// ─── DTO ─────────────────────────────────────────────────────────────────────

export interface NoteDTO {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  created_at: string; // ISO 8601
  share_code: string | null;
  space_id: string | null; // Phase 1 恒 null
}

/**
 * Task 行 → NoteDTO,收窄到笔记对外字段。
 * 屏蔽:priority/status/due_date/start_date/end_date/assignee 系列/mentioned_emails/
 *       progress/sort_order/milestone/parent_id/pinned/invite 系列/voice_raw_text/org_id 等。
 */
export function toNoteDTO(task: Task): NoteDTO {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    tags: task.tags ?? [],
    created_at: task.created_at,
    share_code: task.share_code ?? null,
    space_id: task.space_id ?? null,
  };
}

// ─── Row mapping(直接从 pg 行映射,绕过 rowToTask 的任务语义)────────────────

interface NoteRow {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  created_at: Date;
  share_code: string | null;
  space_id: string | null;
  user_id: string;
}

function rowToNoteDTO(row: NoteRow): NoteDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    tags: row.tags ?? [],
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    share_code: row.share_code ?? null,
    space_id: row.space_id ?? null,
  };
}

// ─── 游标分页 ────────────────────────────────────────────────────────────────

export interface Cursor {
  created_at: string;
  id: string;
}

function encodeCursor(created_at: string, id: string): string {
  return Buffer.from(`${created_at}|${id}`).toString("base64");
}

function decodeCursor(raw: string): Cursor | null {
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    const sep = decoded.lastIndexOf("|");
    if (sep < 0) return null;
    const created_at = decoded.slice(0, sep);
    const id = decoded.slice(sep + 1);
    if (!created_at || !id) return null;
    return { created_at, id };
  } catch {
    return null;
  }
}

// ─── 查询 ────────────────────────────────────────────────────────────────────

export interface GetNotesOptions {
  cursor?: string; // Base64 编码的 created_at|id
  limit?: number; // 默认 20,上限 50
  tag?: string;
  q?: string; // 标题/描述模糊搜索(Phase 1 可选)
}

export interface GetNotesResult {
  items: NoteDTO[];
  total: number;
  has_more: boolean;
  next_cursor: string | null;
}

/**
 * 列出当前用户的个人笔记(游标分页,created_at DESC, id DESC)。
 *
 * Phase 1:WHERE user_id=$1 AND type=1 AND space_id IS NULL
 */
export async function getNotes(
  userId: string,
  opts: GetNotesOptions = {}
): Promise<GetNotesResult> {
  const limit = Math.max(1, Math.min(50, opts.limit ?? 20));
  const fetchLimit = limit + 1;

  // 过滤条件(user_id/type/space_id + 可选 tag/q),filterParams 给 count 复用
  const conditions = ["user_id = $1", "type = 1", "space_id IS NULL"];
  const filterParams: unknown[] = [userId];
  let idx = 2;

  if (opts.tag) {
    filterParams.push(opts.tag);
    conditions.push(`$${idx++} = ANY(tags)`);
  }

  if (opts.q) {
    filterParams.push(`%${opts.q}%`);
    conditions.push(`(title ILIKE $${idx} OR description ILIKE $${idx})`);
    idx++;
  }

  const where = conditions.join(" AND ");

  // 游标追加到列表查询专属参数
  let cursorClause = "";
  const listParams = [...filterParams];
  if (opts.cursor) {
    const c = decodeCursor(opts.cursor);
    if (c) {
      listParams.push(c.created_at, c.id);
      cursorClause = ` AND (created_at, id) < ($${idx}, $${idx + 1})`;
    }
    // 无效游标 → 忽略,从头发页
  }

  // 并行:列表(fetchLimit) + 总数
  const [listRes, countRes] = await Promise.all([
    sql.query(
      `SELECT id, title, description, tags, created_at, share_code, space_id, user_id
       FROM ai_todo_tasks
       WHERE ${where}${cursorClause}
       ORDER BY created_at DESC, id DESC
       LIMIT ${fetchLimit}`,
      listParams
    ),
    sql.query(`SELECT COUNT(*)::int AS cnt FROM ai_todo_tasks WHERE ${where}`, filterParams),
  ]);

  const rows = listRes.rows as NoteRow[];
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(rowToNoteDTO);
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.created_at, last.id) : null;
  const total = Number(countRes.rows[0]?.cnt ?? 0);

  return { items, total, has_more: hasMore, next_cursor: nextCursor };
}

/**
 * 获取单条笔记(含 user_id 供路由层归属判定)。
 * 强制 type=1:任务(type=0)在门面视角不存在 → 返回 null。
 */
export async function getNote(noteId: string): Promise<{ note: NoteDTO; user_id: string } | null> {
  const { rows } = await sql.query(
    `SELECT id, title, description, tags, created_at, share_code, space_id, user_id
     FROM ai_todo_tasks
     WHERE id = $1 AND type = 1`,
    [noteId]
  );
  if (!rows[0]) return null;
  const row = rows[0] as NoteRow;
  return { note: rowToNoteDTO(row), user_id: row.user_id };
}

// ─── 写操作 ──────────────────────────────────────────────────────────────────

export interface CreateNoteInput {
  title: string; // trim 后 1 ≤ len ≤ 500(路由层校验)
  description?: string;
  tags?: string[];
}

/**
 * 创建个人笔记(type 强制 1,space_id 不设 = null)。
 */
export async function createNote(userId: string, input: CreateNoteInput): Promise<NoteDTO> {
  const task = await createTask(userId, {
    title: input.title,
    description: input.description,
    tags: input.tags ?? [],
    type: 1,
  });
  return toNoteDTO(task);
}

export interface UpdateNoteInput {
  title?: string;
  description?: string | null;
  tags?: string[];
}

/**
 * 更新笔记(仅 title/description/tags,不传 type 规避翻转)。
 * 强制 type=1 WHERE 条件。
 */
export async function updateNote(
  noteId: string,
  userId: string,
  patch: UpdateNoteInput
): Promise<NoteDTO | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (patch.title !== undefined) {
    fields.push(`title = $${idx++}`);
    values.push(patch.title);
  }
  if (patch.description !== undefined) {
    fields.push(`description = $${idx++}`);
    values.push(patch.description);
  }
  if (patch.tags !== undefined) {
    fields.push(`tags = $${idx++}`);
    values.push(patch.tags);
  }

  if (fields.length === 0) return null;

  values.push(noteId, userId);
  const { rows } = await sql.query(
    `UPDATE ai_todo_tasks
     SET ${fields.join(", ")}
     WHERE id = $${idx} AND user_id = $${idx + 1} AND type = 1
     RETURNING id, title, description, tags, created_at, share_code, space_id, user_id`,
    values
  );
  if (!rows[0]) return null;
  return rowToNoteDTO(rows[0] as NoteRow);
}

/**
 * 删除笔记。强制 type=1。
 * 返回是否删除成功(rowCount)。
 */
export async function deleteNote(noteId: string, userId: string): Promise<boolean> {
  const res = await sql.query(
    `DELETE FROM ai_todo_tasks WHERE id = $1 AND user_id = $2 AND type = 1`,
    [noteId, userId]
  );
  return (res.rowCount ?? 0) > 0;
}
