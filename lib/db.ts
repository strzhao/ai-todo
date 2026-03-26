import { sql } from "@vercel/postgres";
import type { Task, ParsedTask, TaskMember, TaskLog, Organization, OrgMember } from "./types";
import {
  getTaskRoles,
  getDisallowedFields,
  buildPermissionErrorMessage,
  checkTaskPermission,
  buildOperationErrorMessage,
  TaskPermissionError,
} from "./task-permissions";

export class TaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskValidationError";
  }
}

const DB_SCHEMA_VERSION = 4; // bump when adding new tables/columns
let _dbSchemaVersion = 0;
let _dbInitPromise: Promise<void> | null = null;

export async function initDb() {
  if (_dbSchemaVersion >= DB_SCHEMA_VERSION) return;
  if (_dbInitPromise) return _dbInitPromise;
  _dbInitPromise = _doInitDb()
    .then(() => {
      _dbSchemaVersion = DB_SCHEMA_VERSION;
    })
    .finally(() => {
      _dbInitPromise = null;
    });
  return _dbInitPromise;
}

async function _doInitDb() {
  // 1. Tasks table (core, must exist first for self-referencing FK)
  await sql`
    CREATE TABLE IF NOT EXISTS ai_todo_tasks (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      TEXT NOT NULL,
      title        TEXT NOT NULL,
      description  TEXT,
      due_date     TIMESTAMPTZ,
      priority     SMALLINT DEFAULT 2,
      status       SMALLINT DEFAULT 0,
      tags         TEXT[] DEFAULT '{}',
      sort_order   INTEGER DEFAULT 0,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `;

  // 2. Add columns to tasks (idempotent)
  await sql`ALTER TABLE ai_todo_tasks ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES ai_todo_tasks(id) ON DELETE SET NULL`;
  await sql`ALTER TABLE ai_todo_tasks ADD COLUMN IF NOT EXISTS assignee_id TEXT`;
  await sql`ALTER TABLE ai_todo_tasks ADD COLUMN IF NOT EXISTS assignee_email TEXT`;
  await sql`ALTER TABLE ai_todo_tasks ADD COLUMN IF NOT EXISTS mentioned_emails TEXT[] DEFAULT '{}'`;
  await sql`ALTER TABLE ai_todo_tasks ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES ai_todo_tasks(id) ON DELETE CASCADE`;
  await sql`ALTER TABLE ai_todo_tasks ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ`;
  await sql`ALTER TABLE ai_todo_tasks ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ`;
  await sql`ALTER TABLE ai_todo_tasks ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE ai_todo_tasks ADD COLUMN IF NOT EXISTS invite_code TEXT`;
  await sql`ALTER TABLE ai_todo_tasks ADD COLUMN IF NOT EXISTS invite_mode TEXT DEFAULT 'open'`;
  await sql`ALTER TABLE ai_todo_tasks ADD COLUMN IF NOT EXISTS progress SMALLINT DEFAULT 0`;
  await sql`ALTER TABLE ai_todo_tasks ADD COLUMN IF NOT EXISTS type SMALLINT DEFAULT 0`;

  // 3. Indexes on tasks
  await sql`CREATE INDEX IF NOT EXISTS idx_ai_todo_tasks_user_id ON ai_todo_tasks(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ai_todo_tasks_due     ON ai_todo_tasks(user_id, due_date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tasks_space           ON ai_todo_tasks(space_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tasks_assignee        ON ai_todo_tasks(assignee_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tasks_parent          ON ai_todo_tasks(parent_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tasks_dates           ON ai_todo_tasks(space_id, start_date, end_date)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_invite_code ON ai_todo_tasks(invite_code) WHERE invite_code IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tasks_pinned          ON ai_todo_tasks(pinned) WHERE pinned = TRUE`;

  // 4. Task members table (replaces ai_todo_space_members)
  await sql`
    CREATE TABLE IF NOT EXISTS ai_todo_task_members (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id      UUID NOT NULL REFERENCES ai_todo_tasks(id) ON DELETE CASCADE,
      user_id      TEXT NOT NULL,
      email        TEXT NOT NULL,
      display_name TEXT,
      role         TEXT NOT NULL DEFAULT 'member',
      status       TEXT NOT NULL DEFAULT 'active',
      joined_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(task_id, user_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_task_members_task_id    ON ai_todo_task_members(task_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_task_members_user_id    ON ai_todo_task_members(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_task_members_task_email ON ai_todo_task_members(task_id, email)`;

  // 5. Task logs table
  await sql`
    CREATE TABLE IF NOT EXISTS ai_todo_task_logs (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id    UUID NOT NULL REFERENCES ai_todo_tasks(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL,
      user_email TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_task_logs_task ON ai_todo_task_logs(task_id)`;

  // 6. Activated users table (invitation-code access gate)
  await sql`
    CREATE TABLE IF NOT EXISTS ai_todo_activated_users (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      TEXT NOT NULL UNIQUE,
      email        TEXT NOT NULL,
      activated_at TIMESTAMPTZ DEFAULT NOW(),
      invited_by   TEXT,
      invite_code  TEXT
    )
  `;

  // 7. Add nickname column to activated users
  await sql`ALTER TABLE ai_todo_activated_users ADD COLUMN IF NOT EXISTS nickname TEXT`;

  // 8. Summary cache (server-side, shared across all space members)
  await sql`
    CREATE TABLE IF NOT EXISTS ai_todo_summary_cache (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id      UUID NOT NULL REFERENCES ai_todo_tasks(id) ON DELETE CASCADE,
      summary_date DATE NOT NULL,
      content      TEXT NOT NULL,
      generated_by TEXT NOT NULL,
      generated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(task_id, summary_date)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_summary_cache_task_date ON ai_todo_summary_cache(task_id, summary_date)`;

  // 9. Summary usage tracking (rate limiting per user per day)
  await sql`
    CREATE TABLE IF NOT EXISTS ai_todo_summary_usage (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    TEXT NOT NULL,
      usage_date DATE NOT NULL,
      count      INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, usage_date)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_summary_usage_user_date ON ai_todo_summary_usage(user_id, usage_date)`;

  // 10. Notifications table
  await sql`
    CREATE TABLE IF NOT EXISTS ai_todo_notifications (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     TEXT NOT NULL,
      type        TEXT NOT NULL,
      title       TEXT NOT NULL,
      body        TEXT,
      task_id     UUID REFERENCES ai_todo_tasks(id) ON DELETE CASCADE,
      space_id    UUID REFERENCES ai_todo_tasks(id) ON DELETE CASCADE,
      actor_id    TEXT,
      actor_email TEXT,
      read        BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_notif_user ON ai_todo_notifications(user_id, read, created_at DESC)`;

  // 11. Notification preferences table
  await sql`
    CREATE TABLE IF NOT EXISTS ai_todo_notification_prefs (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    TEXT NOT NULL UNIQUE,
      prefs      JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // 12. Summary config table (per-space AI summary customization)
  await sql`
    CREATE TABLE IF NOT EXISTS ai_todo_summary_config (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      space_id     UUID NOT NULL UNIQUE REFERENCES ai_todo_tasks(id) ON DELETE CASCADE,
      system_prompt TEXT,
      data_template TEXT,
      data_sources  JSONB DEFAULT '[]',
      updated_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_by   TEXT
    )
  `;

  // 12b. Add prompt_templates column to summary config
  await sql`ALTER TABLE ai_todo_summary_config ADD COLUMN IF NOT EXISTS prompt_templates JSONB DEFAULT '[]'`;

  // 12c. Add linked_spaces column to summary config
  await sql`ALTER TABLE ai_todo_summary_config ADD COLUMN IF NOT EXISTS linked_spaces JSONB DEFAULT '[]'`;

  // 12d. Add template_id column to summary cache + update unique constraint
  await sql`ALTER TABLE ai_todo_summary_cache ADD COLUMN IF NOT EXISTS template_id TEXT DEFAULT 'default'`;
  // Migrate unique constraint to include template_id (idempotent via try/catch)
  try {
    await sql`ALTER TABLE ai_todo_summary_cache DROP CONSTRAINT IF EXISTS ai_todo_summary_cache_task_id_summary_date_key`;
    await sql`ALTER TABLE ai_todo_summary_cache ADD CONSTRAINT ai_todo_summary_cache_task_date_template_key UNIQUE (task_id, summary_date, template_id)`;
  } catch {
    // Constraint already exists or old one already dropped
  }

  // 13. Push subscriptions table (browser push notifications)
  await sql`
    CREATE TABLE IF NOT EXISTS ai_todo_push_subscriptions (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    TEXT NOT NULL,
      endpoint   TEXT NOT NULL UNIQUE,
      p256dh     TEXT NOT NULL,
      auth       TEXT NOT NULL,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_push_sub_user ON ai_todo_push_subscriptions(user_id)`;

  // 14. Organizations table
  await sql`
    CREATE TABLE IF NOT EXISTS ai_todo_orgs (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT NOT NULL,
      description TEXT,
      owner_id    TEXT NOT NULL,
      invite_code TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_orgs_invite_code ON ai_todo_orgs(invite_code) WHERE invite_code IS NOT NULL`;

  // 15. Organization members table
  await sql`
    CREATE TABLE IF NOT EXISTS ai_todo_org_members (
      id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id    UUID NOT NULL REFERENCES ai_todo_orgs(id) ON DELETE CASCADE,
      user_id   TEXT NOT NULL,
      email     TEXT NOT NULL,
      role      TEXT NOT NULL DEFAULT 'member',
      status    TEXT NOT NULL DEFAULT 'active',
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(org_id, user_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_org_members_org ON ai_todo_org_members(org_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_org_members_user ON ai_todo_org_members(user_id)`;

  // 16. Add org_id column to tasks
  await sql`ALTER TABLE ai_todo_tasks ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES ai_todo_orgs(id) ON DELETE SET NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tasks_org ON ai_todo_tasks(org_id) WHERE org_id IS NOT NULL`;

  // 17. Add share_code column to tasks (note sharing)
  await sql`ALTER TABLE ai_todo_tasks ADD COLUMN IF NOT EXISTS share_code TEXT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_share_code ON ai_todo_tasks(share_code) WHERE share_code IS NOT NULL`;

  // 18. Personal summary cache (per-user daily summary)
  await sql`
    CREATE TABLE IF NOT EXISTS ai_todo_personal_summary_cache (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      TEXT NOT NULL,
      summary_date DATE NOT NULL,
      content      TEXT NOT NULL,
      generated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, summary_date)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_personal_summary_cache_user_date ON ai_todo_personal_summary_cache(user_id, summary_date)`;

  // Seed already executed on 2026-03-07: all existing users auto-activated.
}

export async function migrateDb() {
  await initDb();
}

// ─── Activation (invitation-code access gate) ────────────────────────────────

export async function isUserActivated(userId: string): Promise<boolean> {
  const { rows } = await sql`
    SELECT 1 FROM ai_todo_activated_users WHERE user_id = ${userId} LIMIT 1
  `;
  return rows.length > 0;
}

export async function activateUser(
  userId: string,
  email: string,
  invitedBy?: string,
  inviteCode?: string
): Promise<void> {
  await sql.query(
    `INSERT INTO ai_todo_activated_users (user_id, email, invited_by, invite_code)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, email, invitedBy ?? null, inviteCode ?? null]
  );
}

// ─── User nickname ───────────────────────────────────────────────────────────

export async function getUserActivation(
  userId: string
): Promise<{ activated: boolean; nickname: string | null }> {
  const { rows } = await sql`
    SELECT nickname FROM ai_todo_activated_users WHERE user_id = ${userId} LIMIT 1
  `;
  if (!rows[0]) return { activated: false, nickname: null };
  return { activated: true, nickname: (rows[0].nickname as string) ?? null };
}

export async function getUserNickname(userId: string): Promise<string | null> {
  const { rows } = await sql`
    SELECT nickname FROM ai_todo_activated_users WHERE user_id = ${userId} LIMIT 1
  `;
  return (rows[0]?.nickname as string) ?? null;
}

export async function setUserNickname(userId: string, nickname: string | null): Promise<void> {
  await sql`
    UPDATE ai_todo_activated_users SET nickname = ${nickname} WHERE user_id = ${userId}
  `;
}

// ─── Row mapping ─────────────────────────────────────────────────────────────

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    title: row.title as string,
    description: row.description as string | undefined,
    due_date: row.due_date ? (row.due_date as Date).toISOString() : undefined,
    start_date: row.start_date ? (row.start_date as Date).toISOString() : undefined,
    end_date: row.end_date ? (row.end_date as Date).toISOString() : undefined,
    priority: row.priority as Task["priority"],
    status: row.status as Task["status"],
    tags: (row.tags as string[]) ?? [],
    sort_order: row.sort_order as number,
    created_at: (row.created_at as Date).toISOString(),
    completed_at: row.completed_at ? (row.completed_at as Date).toISOString() : undefined,
    space_id: (row.space_id as string) || undefined,
    assignee_id: (row.assignee_id as string) || undefined,
    assignee_email: (row.assignee_email as string) || undefined,
    mentioned_emails: (row.mentioned_emails as string[]) ?? [],
    progress: row.progress != null ? Number(row.progress) : 0,
    type: row.type != null ? (Number(row.type) as 0 | 1) : 0,
    parent_id: (row.parent_id as string) || undefined,
    pinned: (row.pinned as boolean) || undefined,
    invite_code: (row.invite_code as string) || undefined,
    invite_mode: (row.invite_mode as "open" | "approval") || undefined,
    share_code: (row.share_code as string) || undefined,
    creator_email: (row.creator_email as string) || undefined,
    creator_nickname: (row.creator_nickname as string) || undefined,
    org_id: (row.org_id as string) || undefined,
    member_count: row.member_count != null ? Number(row.member_count) : undefined,
    task_count: row.task_count != null ? Number(row.task_count) : undefined,
    my_role: (row.my_role as "owner" | "member") || undefined,
  };
}

function rowToMember(row: Record<string, unknown>): TaskMember {
  return {
    id: row.id as string,
    task_id: (row.task_id ?? row.space_id) as string, // compat: migration may still have space_id col
    user_id: row.user_id as string,
    email: row.email as string,
    display_name: (row.display_name as string) || undefined,
    nickname: (row.nickname as string) || undefined,
    role: row.role as "owner" | "member",
    status: row.status as "active" | "pending",
    joined_at: (row.joined_at as Date).toISOString(),
  };
}

// ─── Task CRUD ────────────────────────────────────────────────────────────────

export interface GetTasksOptions {
  spaceId?: string;
  filter?: "assigned";
  type?: number;
}

export async function getTasks(userId: string, options: GetTasksOptions = {}): Promise<Task[]> {
  const { spaceId, filter, type } = options;
  const hasType = type !== undefined;
  const typeClause = hasType ? ` AND (COALESCE(type, 0) = ${Number(type)})` : "";

  if (filter === "assigned") {
    const joinClause = type === 1 ? " LEFT JOIN ai_todo_activated_users creator ON t.user_id = creator.user_id" : "";
    const selectClause = type === 1 ? "t.*, creator.email AS creator_email, creator.nickname AS creator_nickname" : "t.*";
    const { rows } = await sql.query(
      `SELECT ${selectClause} FROM ai_todo_tasks t${joinClause}
       WHERE t.assignee_id = $1 AND t.status != 2${typeClause}
       ORDER BY t.priority ASC, t.created_at DESC`,
      [userId]
    );
    return rows.map(rowToTask);
  }

  if (spaceId) {
    // space_id is denormalized on all tasks within a space — no recursive CTE needed
    const joinClause = type === 1 ? " LEFT JOIN ai_todo_activated_users creator ON t.user_id = creator.user_id" : "";
    const selectClause = type === 1 ? "t.*, creator.email AS creator_email, creator.nickname AS creator_nickname" : "t.*";
    const { rows } = await sql.query(
      `SELECT ${selectClause} FROM ai_todo_tasks t${joinClause}
       WHERE t.space_id = $1 AND t.status != 2${typeClause}
       ORDER BY t.priority ASC, t.created_at DESC`,
      [spaceId]
    );
    return rows.map(rowToTask);
  }

  // No spaceId: use sql template tag when no type filter (preserves original behavior),
  // use sql.query when type filter is needed for string concatenation
  if (hasType) {
    const joinClause = type === 1 ? " LEFT JOIN ai_todo_activated_users creator ON t.user_id = creator.user_id" : "";
    const selectClause = type === 1 ? "t.*, creator.email AS creator_email, creator.nickname AS creator_nickname" : "t.*";
    const { rows } = await sql.query(
      `SELECT ${selectClause} FROM ai_todo_tasks t${joinClause}
       WHERE t.user_id = $1 AND t.space_id IS NULL AND t.status != 2${typeClause}
       ORDER BY t.priority ASC, t.created_at DESC`,
      [userId]
    );
    return rows.map(rowToTask);
  }

  const { rows } = await sql`
    SELECT * FROM ai_todo_tasks
    WHERE user_id = ${userId} AND space_id IS NULL AND status != 2
    ORDER BY priority ASC, created_at DESC
  `;
  return rows.map(rowToTask);
}

export async function getAllActiveTasks(userId: string): Promise<Task[]> {
  const { rows } = await sql`
    SELECT * FROM ai_todo_tasks
    WHERE user_id = ${userId} AND status != 2
    ORDER BY priority ASC, created_at DESC
  `;
  return rows.map(rowToTask);
}

export async function getTodayTasks(userId: string, spaceId?: string): Promise<Task[]> {
  if (spaceId) {
    const { rows } = await sql.query(
      `SELECT * FROM ai_todo_tasks
       WHERE space_id = $1 AND status != 2
         AND due_date >= NOW()::DATE
         AND due_date < NOW()::DATE + INTERVAL '1 day'
       ORDER BY priority ASC, due_date ASC`,
      [spaceId]
    );
    return rows.map(rowToTask);
  }

  const { rows } = await sql`
    SELECT * FROM ai_todo_tasks
    WHERE user_id = ${userId}
      AND space_id IS NULL
      AND status != 2
      AND due_date >= NOW()::DATE
      AND due_date < NOW()::DATE + INTERVAL '1 day'
    ORDER BY priority ASC, due_date ASC
  `;
  return rows.map(rowToTask);
}

export async function getCompletedTasks(
  userId: string,
  spaceId?: string,
  type?: number,
  opts?: { limit?: number; before?: string; beforeId?: string }
): Promise<{ tasks: Task[]; hasMore: boolean }> {
  const limit = opts?.limit ?? 20;
  const fetchLimit = limit + 1;
  const hasCursor = opts?.before && opts?.beforeId;
  const hasType = type !== undefined;
  const typeClause = hasType ? ` AND (COALESCE(type, 0) = ${Number(type)})` : "";

  if (spaceId) {
    const joinClause = type === 1 ? " LEFT JOIN ai_todo_activated_users creator ON t.user_id = creator.user_id" : "";
    const selectClause = type === 1 ? "t.*, creator.email AS creator_email, creator.nickname AS creator_nickname" : "t.*";
    const params: unknown[] = [spaceId];
    let cursorSql = "";
    if (hasCursor) {
      params.push(opts!.before, opts!.beforeId);
      cursorSql = ` AND (t.completed_at, t.id) < ($${params.length - 1}, $${params.length})`;
    }
    const { rows } = await sql.query(
      `SELECT ${selectClause} FROM ai_todo_tasks t${joinClause}
       WHERE t.space_id = $1 AND t.status = 2${typeClause}${cursorSql}
       ORDER BY t.completed_at DESC, t.id DESC
       LIMIT ${fetchLimit}`,
      params
    );
    const hasMore = rows.length > limit;
    return { tasks: rows.slice(0, limit).map(rowToTask), hasMore };
  }

  // No spaceId: always use sql.query for cursor support
  if (hasType) {
    const joinClause = type === 1 ? " LEFT JOIN ai_todo_activated_users creator ON t.user_id = creator.user_id" : "";
    const selectClause = type === 1 ? "t.*, creator.email AS creator_email, creator.nickname AS creator_nickname" : "t.*";
    const params: unknown[] = [userId];
    let cursorSql = "";
    if (hasCursor) {
      params.push(opts!.before, opts!.beforeId);
      cursorSql = ` AND (t.completed_at, t.id) < ($${params.length - 1}, $${params.length})`;
    }
    const { rows } = await sql.query(
      `SELECT ${selectClause} FROM ai_todo_tasks t${joinClause}
       WHERE t.user_id = $1 AND t.space_id IS NULL AND t.status = 2${typeClause}${cursorSql}
       ORDER BY t.completed_at DESC, t.id DESC
       LIMIT ${fetchLimit}`,
      params
    );
    const hasMore = rows.length > limit;
    return { tasks: rows.slice(0, limit).map(rowToTask), hasMore };
  }

  const params: unknown[] = [userId];
  let cursorSql = "";
  if (hasCursor) {
    params.push(opts!.before, opts!.beforeId);
    cursorSql = ` AND (completed_at, id) < ($${params.length - 1}, $${params.length})`;
  }
  const { rows } = await sql.query(
    `SELECT * FROM ai_todo_tasks
     WHERE user_id = $1 AND space_id IS NULL AND status = 2${cursorSql}
     ORDER BY completed_at DESC, id DESC
     LIMIT ${fetchLimit}`,
    params
  );
  const hasMore = rows.length > limit;
  return { tasks: rows.slice(0, limit).map(rowToTask), hasMore };
}

export async function getTaskForUser(taskId: string, userId: string): Promise<Task | null> {
  const { rows } = await sql`
    SELECT t.*,
      COALESCE(m.role, CASE WHEN om.user_id IS NOT NULL THEN 'member' END) AS _member_role
    FROM ai_todo_tasks t
    LEFT JOIN ai_todo_task_members m
      ON m.task_id = COALESCE(t.space_id, t.id)
      AND m.user_id = ${userId}
      AND m.status = 'active'
    LEFT JOIN ai_todo_tasks space_task
      ON space_task.id = COALESCE(t.space_id, t.id)
      AND space_task.pinned = true
    LEFT JOIN ai_todo_org_members om
      ON om.org_id = space_task.org_id
      AND om.user_id = ${userId}
      AND om.status = 'active'
      AND space_task.org_id IS NOT NULL
    WHERE t.id = ${taskId}
      AND (
        (t.space_id IS NULL AND t.pinned = false AND t.user_id = ${userId})
        OR
        m.user_id IS NOT NULL
        OR
        om.user_id IS NOT NULL
      )
  `;
  if (!rows[0]) return null;
  const task = rowToTask(rows[0]);
  task._memberRole = (rows[0]._member_role as string) || undefined;
  return task;
}

export interface CreateTaskData extends ParsedTask {
  spaceId?: string;
  assigneeId?: string;
  assigneeEmail?: string;
  mentionedEmails?: string[];
  parentId?: string;
  startDate?: string;
  endDate?: string;
  type?: 0 | 1;
}

export async function createTask(userId: string, data: CreateTaskData): Promise<Task> {
  const { rows } = await sql.query(
    `INSERT INTO ai_todo_tasks
       (user_id, title, description, due_date, priority, tags, space_id, assignee_id, assignee_email, mentioned_emails, parent_id, start_date, end_date, progress, type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      userId,
      data.title,
      data.description ?? null,
      data.due_date ?? null,
      data.priority ?? 2,
      data.tags ?? [],
      data.spaceId ?? null,
      data.assigneeId ?? null,
      data.assigneeEmail ?? null,
      data.mentionedEmails ?? [],
      data.parentId ?? null,
      data.startDate ?? data.start_date ?? null,
      data.endDate ?? data.end_date ?? null,
      data.progress ?? 0,
      data.type ?? 0,
    ]
  );
  return rowToTask(rows[0]);
}

export async function completeTask(taskId: string, userId: string): Promise<Task> {
  const task = await getTaskForUser(taskId, userId);
  if (!task) throw new Error("Task not found");

  if (task.space_id) {
    const roles = getTaskRoles(task, userId, task._memberRole);
    if (!checkTaskPermission(roles, "complete")) {
      throw new TaskPermissionError(buildOperationErrorMessage("complete"));
    }
  }

  const { rows } = await sql`
    UPDATE ai_todo_tasks SET status = 2, completed_at = NOW()
    WHERE id = ${taskId}
    RETURNING *
  `;
  // 递归完成所有后代任务（不仅仅是直接子任务）
  await sql.query(
    `WITH RECURSIVE descendants AS (
       SELECT id FROM ai_todo_tasks WHERE parent_id = $1
       UNION ALL
       SELECT t.id FROM ai_todo_tasks t
       JOIN descendants d ON t.parent_id = d.id
     )
     UPDATE ai_todo_tasks SET status = 2, completed_at = NOW()
     WHERE id IN (SELECT id FROM descendants) AND status = 0`,
    [taskId]
  );
  return rowToTask(rows[0]);
}

export async function reopenTask(taskId: string, userId: string): Promise<Task> {
  const task = await getTaskForUser(taskId, userId);
  if (!task) throw new Error("Task not found");

  if (task.space_id) {
    const roles = getTaskRoles(task, userId, task._memberRole);
    if (!checkTaskPermission(roles, "reopen")) {
      throw new TaskPermissionError(buildOperationErrorMessage("reopen"));
    }
  }

  const { rows } = await sql`
    UPDATE ai_todo_tasks SET status = 0, completed_at = NULL
    WHERE id = ${taskId}
    RETURNING *
  `;
  return rowToTask(rows[0]);
}

export async function deleteTask(taskId: string, userId: string): Promise<void> {
  const task = await getTaskForUser(taskId, userId);
  if (!task) throw new TaskPermissionError("任务不存在或无权访问");

  if (task.space_id) {
    const roles = getTaskRoles(task, userId, task._memberRole);
    if (!checkTaskPermission(roles, "delete")) {
      throw new TaskPermissionError(buildOperationErrorMessage("delete"));
    }
  }
  // 个人任务已通过 getTaskForUser 的 user_id 检查

  await sql`DELETE FROM ai_todo_tasks WHERE id = ${taskId}`;
}

export async function updateTask(
  taskId: string,
  userId: string,
  patch: Partial<ParsedTask> & {
    assignee_email?: string | null;
    assigneeEmail?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    parent_id?: string | null;
    progress?: number;
    type?: 0 | 1;
  }
): Promise<Task | null> {
  const task = await getTaskForUser(taskId, userId);
  if (!task) return null;

  // 空间任务：基于角色的权限检查
  if (task.space_id) {
    const roles = getTaskRoles(task, userId, task._memberRole);
    const patchKeys = Object.keys(patch).filter(
      (k) => (patch as Record<string, unknown>)[k] !== undefined
    );
    const disallowed = getDisallowedFields(roles, patchKeys);
    if (disallowed.length > 0) {
      throw new TaskPermissionError(buildPermissionErrorMessage(disallowed));
    }
  }

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
  if (patch.due_date !== undefined) {
    fields.push(`due_date = $${idx++}`);
    values.push(patch.due_date);
  }
  if (patch.priority !== undefined) {
    fields.push(`priority = $${idx++}`);
    values.push(patch.priority);
  }
  if (patch.tags !== undefined) {
    fields.push(`tags = $${idx++}`);
    values.push(patch.tags);
  }
  const nextAssigneeEmail =
    "assignee_email" in patch
      ? patch.assignee_email
      : "assigneeEmail" in patch
        ? patch.assigneeEmail
        : undefined;
  if (nextAssigneeEmail !== undefined) {
    if (nextAssigneeEmail === null || String(nextAssigneeEmail).trim() === "") {
      fields.push(`assignee_email = $${idx++}`);
      values.push(null);
      fields.push(`assignee_id = $${idx++}`);
      values.push(null);
    } else {
      const normalizedEmail = String(nextAssigneeEmail).trim().toLowerCase();
      let assigneeId: string | null = null;
      if (task.space_id) {
        const { rows: memberRows } = await sql.query(
          `SELECT user_id
           FROM ai_todo_task_members
           WHERE task_id = $1 AND status = 'active' AND LOWER(email) = LOWER($2)
           LIMIT 1`,
          [task.space_id, normalizedEmail]
        );
        if (!memberRows[0]) {
          throw new TaskValidationError("Assignee must be an active space member");
        }
        assigneeId = memberRows[0].user_id as string;
      }
      fields.push(`assignee_email = $${idx++}`);
      values.push(normalizedEmail);
      fields.push(`assignee_id = $${idx++}`);
      values.push(assigneeId);
    }
  }
  if (patch.start_date !== undefined) {
    fields.push(`start_date = $${idx++}`);
    values.push(patch.start_date);
  }
  if (patch.end_date !== undefined) {
    fields.push(`end_date = $${idx++}`);
    values.push(patch.end_date);
  }
  if (patch.progress !== undefined) {
    fields.push(`progress = $${idx++}`);
    values.push(patch.progress);
  }
  if (patch.type !== undefined) {
    fields.push(`type = $${idx++}`);
    values.push(patch.type);
  }
  if (patch.parent_id !== undefined) {
    const nextParentId = patch.parent_id || null;

    if (task.pinned) {
      throw new TaskValidationError("Pinned task cannot be moved under another task");
    }

    if (nextParentId === task.id) {
      throw new TaskValidationError("Task cannot be moved under itself");
    }

    if (nextParentId) {
      const parentTask = await getTaskForUser(nextParentId, userId);
      if (!parentTask) {
        throw new TaskValidationError("Parent task not found");
      }

      const sourceScope = task.space_id ?? null;
      const parentScope = parentTask.pinned ? parentTask.id : (parentTask.space_id ?? null);
      if (sourceScope !== parentScope) {
        throw new TaskValidationError("Cannot move task across spaces");
      }

      const { rows: cycleRows } = await sql.query(
        `WITH RECURSIVE ancestors AS (
           SELECT id, parent_id FROM ai_todo_tasks WHERE id = $1
           UNION ALL
           SELECT t.id, t.parent_id
           FROM ai_todo_tasks t
           JOIN ancestors a ON t.id = a.parent_id
           WHERE a.parent_id IS NOT NULL
         )
         SELECT 1 FROM ancestors WHERE id = $2 LIMIT 1`,
        [nextParentId, taskId]
      );
      if (cycleRows[0]) {
        throw new TaskValidationError("Cannot move task under its own descendant");
      }
    }

    fields.push(`parent_id = $${idx++}`);
    values.push(nextParentId);
  }

  if (fields.length === 0) return task;

  const { rows } = await sql.query(
    `UPDATE ai_todo_tasks SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
    [...values, taskId]
  );
  return rowToTask(rows[0]);
}

// ─── Pinned Task ("Space") CRUD ───────────────────────────────────────────────

function generateInviteCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function generateShareCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export async function getTaskByShareCode(code: string): Promise<Task | null> {
  const { rows } = await sql`
    SELECT * FROM ai_todo_tasks WHERE share_code = ${code} AND type = 1
  `;
  return rows.length ? rowToTask(rows[0]) : null;
}

export async function setShareCode(taskId: string, code: string | null): Promise<void> {
  await sql`UPDATE ai_todo_tasks SET share_code = ${code} WHERE id = ${taskId}::uuid`;
}

// Returns all pinned tasks the user is an active member of (sidebar data)
export async function getPinnedTasksForUser(userId: string): Promise<Task[]> {
  const { rows } = await sql`
    SELECT
      t.*,
      my.role AS my_role,
      (SELECT COUNT(*) FROM ai_todo_task_members m WHERE m.task_id = t.id AND m.status = 'active') AS member_count,
      (SELECT COUNT(*) FROM ai_todo_tasks c WHERE c.space_id = t.id AND c.status != 2) AS task_count
    FROM ai_todo_tasks t
    JOIN ai_todo_task_members my ON my.task_id = t.id AND my.user_id = ${userId} AND my.status = 'active'
    WHERE t.pinned = TRUE
    ORDER BY t.created_at ASC
  `;
  return rows.map(rowToTask);
}

export interface PinTaskOptions {
  invite_mode?: "open" | "approval";
}

// Pin an existing task to the sidebar (makes it a collaboration root)
export async function pinTask(
  taskId: string,
  userId: string,
  email: string,
  opts: PinTaskOptions = {}
): Promise<Task> {
  const task = await getTaskForUser(taskId, userId);
  if (!task) throw new Error("Task not found");

  if (task.parent_id) {
    throw new TaskValidationError("Only top-level tasks can be pinned");
  }

  if (task.pinned) {
    await sql.query(
      `INSERT INTO ai_todo_task_members (task_id, user_id, email, role, status)
       VALUES ($1, $2, $3, 'owner', 'active')
       ON CONFLICT (task_id, user_id) DO NOTHING`,
      [taskId, userId, email]
    );
    return task;
  }

  let inviteCode = generateInviteCode();
  // Ensure uniqueness
  const { rows: existing } =
    await sql`SELECT 1 FROM ai_todo_tasks WHERE invite_code = ${inviteCode}`;
  if (existing.length > 0) inviteCode = generateInviteCode();

  const { rows } = await sql.query(
    `UPDATE ai_todo_tasks
     SET pinned = TRUE, invite_code = $1, invite_mode = $2
     WHERE id = $3
     RETURNING *`,
    [inviteCode, opts.invite_mode ?? "open", taskId]
  );
  if (!rows[0]) throw new Error("Task not found");

  await sql.query(
    `INSERT INTO ai_todo_task_members (task_id, user_id, email, role, status)
     VALUES ($1, $2, $3, 'owner', 'active')
     ON CONFLICT (task_id, user_id) DO NOTHING`,
    [taskId, userId, email]
  );

  return rowToTask(rows[0]);
}

// Unpin a task (removes collaboration, keeps task and its children)
export async function unpinTask(taskId: string): Promise<void> {
  await sql.query(
    `UPDATE ai_todo_tasks
     SET pinned = FALSE, invite_code = NULL, invite_mode = 'open'
     WHERE id = $1`,
    [taskId]
  );
}

// Create a brand-new pinned task (equivalent of old createSpace)
export async function createPinnedTask(
  userId: string,
  email: string,
  data: { title: string; description?: string; invite_mode?: "open" | "approval" }
): Promise<Task> {
  let inviteCode = generateInviteCode();
  const { rows: existing } =
    await sql`SELECT 1 FROM ai_todo_tasks WHERE invite_code = ${inviteCode}`;
  if (existing.length > 0) inviteCode = generateInviteCode();

  const { rows } = await sql.query(
    `INSERT INTO ai_todo_tasks (user_id, title, description, pinned, invite_code, invite_mode, tags, mentioned_emails)
     VALUES ($1, $2, $3, TRUE, $4, $5, '{}', '{}')
     RETURNING *`,
    [userId, data.title, data.description ?? null, inviteCode, data.invite_mode ?? "open"]
  );
  const task = rowToTask(rows[0]);

  await sql.query(
    `INSERT INTO ai_todo_task_members (task_id, user_id, email, role, status)
     VALUES ($1, $2, $3, 'owner', 'active')`,
    [task.id, userId, email]
  );

  return { ...task, member_count: 1, task_count: 0, my_role: "owner" };
}

export async function getTaskById(id: string): Promise<Task | null> {
  const { rows } = await sql`SELECT * FROM ai_todo_tasks WHERE id = ${id}`;
  return rows[0] ? rowToTask(rows[0]) : null;
}

export async function getTaskByInviteCode(code: string): Promise<Task | null> {
  const { rows } = await sql`
    SELECT t.*,
      (SELECT COUNT(*) FROM ai_todo_task_members m WHERE m.task_id = t.id AND m.status = 'active') AS member_count
    FROM ai_todo_tasks t
    WHERE t.invite_code = ${code}
  `;
  return rows[0] ? rowToTask(rows[0]) : null;
}

export async function updatePinnedTask(
  id: string,
  patch: { title?: string; description?: string; invite_mode?: string }
): Promise<Task | null> {
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
  if (patch.invite_mode !== undefined) {
    fields.push(`invite_mode = $${idx++}`);
    values.push(patch.invite_mode);
  }

  if (fields.length === 0) {
    const { rows } = await sql`SELECT * FROM ai_todo_tasks WHERE id = ${id}`;
    return rows[0] ? rowToTask(rows[0]) : null;
  }

  const { rows } = await sql.query(
    `UPDATE ai_todo_tasks SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
    [...values, id]
  );
  return rows[0] ? rowToTask(rows[0]) : null;
}

// ─── Task Member CRUD ─────────────────────────────────────────────────────────

export async function getTaskMembers(taskId: string): Promise<TaskMember[]> {
  const { rows } = await sql`
    SELECT m.*, u.nickname
    FROM ai_todo_task_members m
    LEFT JOIN ai_todo_activated_users u ON m.user_id = u.user_id
    WHERE m.task_id = ${taskId}
    ORDER BY m.role ASC, m.joined_at ASC
  `;
  return rows.map(rowToMember);
}

export async function getTaskMemberRecord(
  taskId: string,
  userId: string
): Promise<TaskMember | null> {
  const { rows } = await sql`
    SELECT * FROM ai_todo_task_members WHERE task_id = ${taskId} AND user_id = ${userId}
  `;
  return rows[0] ? rowToMember(rows[0]) : null;
}

export async function addTaskMember(
  taskId: string,
  userId: string,
  email: string,
  role: "owner" | "member" = "member",
  status: "active" | "pending" = "active"
): Promise<TaskMember> {
  const { rows } = await sql.query(
    `INSERT INTO ai_todo_task_members (task_id, user_id, email, role, status)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (task_id, user_id) DO UPDATE SET status = EXCLUDED.status
     RETURNING *`,
    [taskId, userId, email, role, status]
  );
  return rowToMember(rows[0]);
}

export async function updateTaskMember(
  taskId: string,
  userId: string,
  patch: { status?: string; display_name?: string; role?: string }
): Promise<TaskMember | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (patch.status !== undefined) {
    fields.push(`status = $${idx++}`);
    values.push(patch.status);
  }
  if (patch.display_name !== undefined) {
    fields.push(`display_name = $${idx++}`);
    values.push(patch.display_name);
  }
  if (patch.role !== undefined) {
    fields.push(`role = $${idx++}`);
    values.push(patch.role);
  }

  if (fields.length === 0) return null;

  const { rows } = await sql.query(
    `UPDATE ai_todo_task_members SET ${fields.join(", ")}
     WHERE task_id = $${idx} AND user_id = $${idx + 1} RETURNING *`,
    [...values, taskId, userId]
  );
  return rows[0] ? rowToMember(rows[0]) : null;
}

export async function removeTaskMember(taskId: string, userId: string): Promise<void> {
  await sql`DELETE FROM ai_todo_task_members WHERE task_id = ${taskId} AND user_id = ${userId}`;
}

// Backward-compat aliases (deprecated)
export const getSpacesByUser = getPinnedTasksForUser;
export const getSpaceMemberRecord = getTaskMemberRecord;
export const addSpaceMember = addTaskMember;

// ─── Task Logs CRUD ───────────────────────────────────────────────────────────

function rowToTaskLog(row: Record<string, unknown>): TaskLog {
  return {
    id: row.id as string,
    task_id: row.task_id as string,
    user_id: row.user_id as string,
    user_email: row.user_email as string,
    content: row.content as string,
    created_at: (row.created_at as Date).toISOString(),
  };
}

export async function getTaskLogs(taskId: string): Promise<TaskLog[]> {
  const { rows } = await sql`
    SELECT * FROM ai_todo_task_logs
    WHERE task_id = ${taskId}
    ORDER BY created_at ASC
  `;
  return rows.map(rowToTaskLog);
}

// Returns only active (non-completed) direct children of the given parent task.
export async function getChildTasks(parentId: string): Promise<Task[]> {
  const { rows } = await sql.query(
    `SELECT * FROM ai_todo_tasks
     WHERE parent_id = $1 AND status != 2
     ORDER BY priority ASC, created_at DESC
     LIMIT 500`,
    [parentId]
  );
  return rows.map(rowToTask);
}

export async function getDescendantTasks(parentId: string): Promise<Task[]> {
  // Try fast path: if parentId is a space (pinned task), use indexed space_id
  const { rows: spaceCheck } = await sql.query(
    `SELECT 1 FROM ai_todo_tasks WHERE id = $1 AND pinned = true LIMIT 1`,
    [parentId]
  );
  if (spaceCheck.length > 0) {
    const { rows } = await sql.query(
      `SELECT * FROM ai_todo_tasks
       WHERE space_id = $1
       ORDER BY priority ASC, created_at DESC
       LIMIT 500`,
      [parentId]
    );
    return rows.map(rowToTask);
  }
  // Fallback: recursive CTE for non-space parent tasks
  const { rows } = await sql.query(
    `WITH RECURSIVE descendants AS (
       SELECT * FROM ai_todo_tasks WHERE parent_id = $1
       UNION ALL
       SELECT t.* FROM ai_todo_tasks t
       JOIN descendants d ON t.parent_id = d.id
     )
     SELECT * FROM descendants
     ORDER BY priority ASC, created_at DESC
     LIMIT 500`,
    [parentId]
  );
  return rows.map(rowToTask);
}

export async function getLogsForTasksByDate(taskIds: string[], date: string): Promise<TaskLog[]> {
  if (taskIds.length === 0) return [];
  const placeholders = taskIds.map((_, i) => `$${i + 1}`).join(",");
  const dateIdx = taskIds.length + 1;
  const { rows } = await sql.query(
    `SELECT * FROM ai_todo_task_logs
     WHERE task_id IN (${placeholders})
       AND created_at >= $${dateIdx}::DATE
       AND created_at < $${dateIdx}::DATE + INTERVAL '1 day'
     ORDER BY created_at ASC
     LIMIT 100`,
    [...taskIds, date]
  );
  return rows.map(rowToTaskLog);
}

export async function getLogsForTasks(taskIds: string[], limit = 500): Promise<TaskLog[]> {
  if (taskIds.length === 0) return [];
  const placeholders = taskIds.map((_, i) => `$${i + 1}`).join(",");
  const limitIdx = taskIds.length + 1;
  const { rows } = await sql.query(
    `SELECT * FROM ai_todo_task_logs
     WHERE task_id IN (${placeholders})
     ORDER BY created_at ASC
     LIMIT $${limitIdx}`,
    [...taskIds, limit]
  );
  return rows.map(rowToTaskLog);
}

export async function addTaskLog(
  taskId: string,
  userId: string,
  userEmail: string,
  content: string
): Promise<TaskLog> {
  const { rows } = await sql.query(
    `INSERT INTO ai_todo_task_logs (task_id, user_id, user_email, content)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [taskId, userId, userEmail, content]
  );
  return rowToTaskLog(rows[0]);
}

// ─── Summary Cache & Usage ────────────────────────────────────────────────────

const SUMMARY_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface SummaryCache {
  task_id: string;
  summary_date: string;
  content: string;
  generated_by: string;
  generated_at: string;
}

export async function getSummaryCache(
  taskId: string,
  date: string,
  templateId: string = "default"
): Promise<SummaryCache | null> {
  const { rows } = await sql.query(
    `SELECT * FROM ai_todo_summary_cache WHERE task_id = $1 AND summary_date = $2 AND template_id = $3 LIMIT 1`,
    [taskId, date, templateId]
  );
  if (!rows[0]) return null;
  const generatedAt = new Date(rows[0].generated_at as string);
  if (Date.now() - generatedAt.getTime() > SUMMARY_CACHE_TTL_MS) return null;
  return {
    task_id: rows[0].task_id as string,
    summary_date: (rows[0].summary_date as Date).toISOString().slice(0, 10),
    content: rows[0].content as string,
    generated_by: rows[0].generated_by as string,
    generated_at: generatedAt.toISOString(),
  };
}

export async function upsertSummaryCache(
  taskId: string,
  date: string,
  content: string,
  userId: string,
  templateId: string = "default"
): Promise<void> {
  await sql.query(
    `INSERT INTO ai_todo_summary_cache (task_id, summary_date, content, generated_by, generated_at, template_id)
     VALUES ($1, $2, $3, $4, NOW(), $5)
     ON CONFLICT (task_id, summary_date, template_id)
     DO UPDATE SET content = EXCLUDED.content, generated_by = EXCLUDED.generated_by, generated_at = NOW()`,
    [taskId, date, content, userId, templateId]
  );
}

export async function getSummaryUsageCount(userId: string, date: string): Promise<number> {
  const { rows } = await sql.query(
    `SELECT count FROM ai_todo_summary_usage WHERE user_id = $1 AND usage_date = $2 LIMIT 1`,
    [userId, date]
  );
  return rows[0] ? Number(rows[0].count) : 0;
}

export async function incrementSummaryUsage(userId: string, date: string): Promise<number> {
  const { rows } = await sql.query(
    `INSERT INTO ai_todo_summary_usage (user_id, usage_date, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (user_id, usage_date)
     DO UPDATE SET count = ai_todo_summary_usage.count + 1
     RETURNING count`,
    [userId, date]
  );
  return Number(rows[0].count);
}

// ─── Personal Summary Cache ──────────────────────────────────────────────────

const PERSONAL_SUMMARY_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function getPersonalSummaryCache(
  userId: string,
  date: string
): Promise<{ content: string; generated_at: string } | null> {
  const { rows } = await sql`
    SELECT content, generated_at FROM ai_todo_personal_summary_cache
    WHERE user_id = ${userId} AND summary_date = ${date} LIMIT 1
  `;
  if (!rows[0]) return null;
  const generatedAtStr = rows[0].generated_at as string;
  const generatedTime = new Date(generatedAtStr).getTime();
  if (Number.isNaN(generatedTime) || Date.now() - generatedTime > PERSONAL_SUMMARY_CACHE_TTL_MS) return null;
  return {
    content: rows[0].content as string,
    generated_at: generatedAtStr,
  };
}

export async function upsertPersonalSummaryCache(
  userId: string,
  date: string,
  content: string
): Promise<void> {
  await sql`
    INSERT INTO ai_todo_personal_summary_cache (user_id, summary_date, content, generated_at)
    VALUES (${userId}, ${date}, ${content}, NOW())
    ON CONFLICT (user_id, summary_date)
    DO UPDATE SET content = EXCLUDED.content, generated_at = NOW()
  `;
}

// ─── Summary Config ──────────────────────────────────────────────────────────

import type { SummaryConfig, SummaryDataSource, PromptTemplate, LinkedSpace } from "./types";

export async function getSummaryConfig(spaceId: string): Promise<SummaryConfig | null> {
  const { rows } = await sql.query(
    `SELECT space_id, system_prompt, data_template, data_sources, prompt_templates, linked_spaces, updated_at, updated_by
     FROM ai_todo_summary_config WHERE space_id = $1 LIMIT 1`,
    [spaceId]
  );
  if (!rows[0]) return null;

  const templates = (rows[0].prompt_templates ?? []) as PromptTemplate[];

  return {
    space_id: rows[0].space_id as string,
    system_prompt: rows[0].system_prompt as string | null,
    data_template: rows[0].data_template as string | null,
    prompt_templates: templates,
    data_sources: (rows[0].data_sources ?? []) as SummaryDataSource[],
    linked_spaces: (rows[0].linked_spaces ?? []) as LinkedSpace[],
    updated_at: (rows[0].updated_at as Date).toISOString(),
    updated_by: rows[0].updated_by as string | null,
  };
}

export async function upsertSummaryConfig(
  spaceId: string,
  config: {
    system_prompt?: string | null;
    data_template?: string | null;
    data_sources?: SummaryDataSource[];
    prompt_templates?: PromptTemplate[];
    linked_spaces?: LinkedSpace[];
  },
  userId: string
): Promise<void> {
  const existing = await getSummaryConfig(spaceId);
  if (existing) {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (config.system_prompt !== undefined) {
      fields.push(`system_prompt = $${idx++}`);
      values.push(config.system_prompt);
    }
    if (config.data_template !== undefined) {
      fields.push(`data_template = $${idx++}`);
      values.push(config.data_template);
    }
    if (config.data_sources !== undefined) {
      fields.push(`data_sources = $${idx++}`);
      values.push(JSON.stringify(config.data_sources));
    }
    if (config.prompt_templates !== undefined) {
      fields.push(`prompt_templates = $${idx++}`);
      values.push(JSON.stringify(config.prompt_templates));
    }
    if (config.linked_spaces !== undefined) {
      fields.push(`linked_spaces = $${idx++}`);
      values.push(JSON.stringify(config.linked_spaces));
    }
    fields.push(`updated_at = NOW()`);
    fields.push(`updated_by = $${idx++}`);
    values.push(userId);
    values.push(spaceId);

    await sql.query(
      `UPDATE ai_todo_summary_config SET ${fields.join(", ")} WHERE space_id = $${idx}`,
      values
    );
  } else {
    await sql.query(
      `INSERT INTO ai_todo_summary_config (space_id, system_prompt, data_template, data_sources, prompt_templates, linked_spaces, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        spaceId,
        config.system_prompt ?? null,
        config.data_template ?? null,
        JSON.stringify(config.data_sources ?? []),
        JSON.stringify(config.prompt_templates ?? []),
        JSON.stringify(config.linked_spaces ?? []),
        userId,
      ]
    );
  }
}

// ─── Organization CRUD ──────────────────────────────────────────────────────────

function generateOrgInviteCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function rowToOrg(row: Record<string, unknown>): Organization {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) || undefined,
    owner_id: row.owner_id as string,
    invite_code: (row.invite_code as string) || undefined,
    created_at: (row.created_at as Date).toISOString(),
    member_count: row.member_count != null ? Number(row.member_count) : undefined,
    space_count: row.space_count != null ? Number(row.space_count) : undefined,
    my_role: (row.my_role as Organization["my_role"]) || undefined,
  };
}

function rowToOrgMember(row: Record<string, unknown>): OrgMember {
  return {
    id: row.id as string,
    org_id: row.org_id as string,
    user_id: row.user_id as string,
    email: row.email as string,
    nickname: (row.nickname as string) || undefined,
    role: row.role as OrgMember["role"],
    status: row.status as OrgMember["status"],
    joined_at: (row.joined_at as Date).toISOString(),
  };
}

export async function getOrgsForUser(userId: string): Promise<Organization[]> {
  const { rows } = await sql.query(
    `SELECT o.*,
       m.role AS my_role,
       (SELECT COUNT(*) FROM ai_todo_org_members om WHERE om.org_id = o.id AND om.status = 'active') AS member_count,
       (SELECT COUNT(*) FROM ai_todo_tasks t WHERE t.org_id = o.id AND t.pinned = TRUE) AS space_count
     FROM ai_todo_orgs o
     JOIN ai_todo_org_members m ON m.org_id = o.id AND m.user_id = $1 AND m.status = 'active'
     ORDER BY o.created_at ASC`,
    [userId]
  );
  return rows.map(rowToOrg);
}

export async function createOrg(
  userId: string,
  email: string,
  data: { name: string; description?: string }
): Promise<Organization> {
  let inviteCode = generateOrgInviteCode();
  const { rows: existing } =
    await sql`SELECT 1 FROM ai_todo_orgs WHERE invite_code = ${inviteCode}`;
  if (existing.length > 0) inviteCode = generateOrgInviteCode();

  const { rows } = await sql.query(
    `INSERT INTO ai_todo_orgs (name, description, owner_id, invite_code)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.name, data.description ?? null, userId, inviteCode]
  );
  const org = rowToOrg(rows[0]);

  await sql.query(
    `INSERT INTO ai_todo_org_members (org_id, user_id, email, role, status)
     VALUES ($1, $2, $3, 'owner', 'active')`,
    [org.id, userId, email]
  );

  return { ...org, member_count: 1, space_count: 0, my_role: "owner" };
}

export async function getOrgById(id: string): Promise<Organization | null> {
  const { rows } = await sql.query(
    `SELECT o.*,
       (SELECT COUNT(*) FROM ai_todo_org_members om WHERE om.org_id = o.id AND om.status = 'active') AS member_count,
       (SELECT COUNT(*) FROM ai_todo_tasks t WHERE t.org_id = o.id AND t.pinned = TRUE) AS space_count
     FROM ai_todo_orgs o WHERE o.id = $1`,
    [id]
  );
  return rows[0] ? rowToOrg(rows[0]) : null;
}

export async function getOrgByInviteCode(code: string): Promise<Organization | null> {
  const { rows } = await sql.query(
    `SELECT o.*,
       (SELECT COUNT(*) FROM ai_todo_org_members om WHERE om.org_id = o.id AND om.status = 'active') AS member_count
     FROM ai_todo_orgs o WHERE o.invite_code = $1`,
    [code]
  );
  return rows[0] ? rowToOrg(rows[0]) : null;
}

export async function updateOrg(
  id: string,
  patch: { name?: string; description?: string }
): Promise<Organization | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (patch.name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(patch.name);
  }
  if (patch.description !== undefined) {
    fields.push(`description = $${idx++}`);
    values.push(patch.description);
  }

  if (fields.length === 0) {
    return getOrgById(id);
  }

  const { rows } = await sql.query(
    `UPDATE ai_todo_orgs SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
    [...values, id]
  );
  return rows[0] ? rowToOrg(rows[0]) : null;
}

export async function deleteOrg(id: string): Promise<void> {
  // Clear org_id on tasks before deleting (FK ON DELETE SET NULL handles this, but be explicit)
  await sql.query(`DELETE FROM ai_todo_orgs WHERE id = $1`, [id]);
}

export async function getOrgMembers(orgId: string): Promise<OrgMember[]> {
  const { rows } = await sql.query(
    `SELECT m.*, u.nickname
     FROM ai_todo_org_members m
     LEFT JOIN ai_todo_activated_users u ON m.user_id = u.user_id
     WHERE m.org_id = $1
     ORDER BY m.role ASC, m.joined_at ASC`,
    [orgId]
  );
  return rows.map(rowToOrgMember);
}

export async function getOrgMemberRecord(orgId: string, userId: string): Promise<OrgMember | null> {
  const { rows } = await sql.query(
    `SELECT m.*, u.nickname
     FROM ai_todo_org_members m
     LEFT JOIN ai_todo_activated_users u ON m.user_id = u.user_id
     WHERE m.org_id = $1 AND m.user_id = $2`,
    [orgId, userId]
  );
  return rows[0] ? rowToOrgMember(rows[0]) : null;
}

export async function addOrgMember(
  orgId: string,
  userId: string,
  email: string,
  role: "owner" | "admin" | "member" = "member",
  status: "active" | "pending" = "active"
): Promise<OrgMember> {
  const { rows } = await sql.query(
    `INSERT INTO ai_todo_org_members (org_id, user_id, email, role, status)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (org_id, user_id) DO UPDATE SET status = EXCLUDED.status
     RETURNING *`,
    [orgId, userId, email, role, status]
  );
  return rowToOrgMember(rows[0]);
}

export async function updateOrgMember(
  orgId: string,
  userId: string,
  patch: { role?: string; status?: string }
): Promise<OrgMember | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (patch.role !== undefined) {
    fields.push(`role = $${idx++}`);
    values.push(patch.role);
  }
  if (patch.status !== undefined) {
    fields.push(`status = $${idx++}`);
    values.push(patch.status);
  }

  if (fields.length === 0) return null;

  const { rows } = await sql.query(
    `UPDATE ai_todo_org_members SET ${fields.join(", ")}
     WHERE org_id = $${idx} AND user_id = $${idx + 1} RETURNING *`,
    [...values, orgId, userId]
  );
  return rows[0] ? rowToOrgMember(rows[0]) : null;
}

export async function removeOrgMember(orgId: string, userId: string): Promise<void> {
  await sql.query(`DELETE FROM ai_todo_org_members WHERE org_id = $1 AND user_id = $2`, [
    orgId,
    userId,
  ]);
}

export async function getOrgSpaces(orgId: string, userId?: string): Promise<Task[]> {
  const { rows } = await sql.query(
    `SELECT t.*,
       ${userId ? `(SELECT my.role FROM ai_todo_task_members my WHERE my.task_id = t.id AND my.user_id = $2 AND my.status = 'active') AS my_role,` : ""}
       (SELECT COUNT(*) FROM ai_todo_task_members m WHERE m.task_id = t.id AND m.status = 'active') AS member_count,
       (SELECT COUNT(*) FROM ai_todo_tasks c WHERE c.space_id = t.id AND c.status != 2) AS task_count
     FROM ai_todo_tasks t
     WHERE t.org_id = $1 AND t.pinned = TRUE
     ORDER BY t.created_at ASC`,
    userId ? [orgId, userId] : [orgId]
  );
  return rows.map(rowToTask);
}
