import { sql } from "@vercel/postgres";
import type { Task, ParsedTask, TaskMember, TaskLog } from "./types";

export class TaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskValidationError";
  }
}

let _dbReady = false;
let _dbInitPromise: Promise<void> | null = null;

export async function initDb() {
  if (_dbReady) return;
  if (_dbInitPromise) return _dbInitPromise;
  _dbInitPromise = _doInitDb()
    .then(() => { _dbReady = true; })
    .finally(() => { _dbInitPromise = null; });
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
    parent_id: (row.parent_id as string) || undefined,
    pinned: (row.pinned as boolean) || undefined,
    invite_code: (row.invite_code as string) || undefined,
    invite_mode: (row.invite_mode as "open" | "approval") || undefined,
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
    role: row.role as "owner" | "member",
    status: row.status as "active" | "pending",
    joined_at: (row.joined_at as Date).toISOString(),
  };
}

// ─── Task CRUD ────────────────────────────────────────────────────────────────

export interface GetTasksOptions {
  spaceId?: string;
  filter?: "assigned";
}

export async function getTasks(userId: string, options: GetTasksOptions = {}): Promise<Task[]> {
  const { spaceId, filter } = options;

  if (filter === "assigned") {
    const { rows } = await sql`
      SELECT * FROM ai_todo_tasks
      WHERE assignee_id = ${userId} AND status != 2
      ORDER BY priority ASC, created_at DESC
    `;
    return rows.map(rowToTask);
  }

  if (spaceId) {
    const { rows } = await sql.query(
      `WITH RECURSIVE descendants AS (
         SELECT id
         FROM ai_todo_tasks
         WHERE parent_id = $1
         UNION ALL
         SELECT t.id
         FROM ai_todo_tasks t
         JOIN descendants d ON t.parent_id = d.id
       ),
       scoped AS (
         SELECT id FROM ai_todo_tasks WHERE space_id = $1
         UNION
         SELECT id FROM descendants
       )
       SELECT t.*
       FROM ai_todo_tasks t
       JOIN scoped s ON s.id = t.id
       WHERE t.status != 2
       ORDER BY t.priority ASC, t.created_at DESC`,
      [spaceId]
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

export async function getTodayTasks(userId: string, spaceId?: string): Promise<Task[]> {
  if (spaceId) {
    const { rows } = await sql.query(
      `WITH RECURSIVE descendants AS (
         SELECT id
         FROM ai_todo_tasks
         WHERE parent_id = $1
         UNION ALL
         SELECT t.id
         FROM ai_todo_tasks t
         JOIN descendants d ON t.parent_id = d.id
       ),
       scoped AS (
         SELECT id FROM ai_todo_tasks WHERE space_id = $1
         UNION
         SELECT id FROM descendants
       )
       SELECT t.*
       FROM ai_todo_tasks t
       JOIN scoped s ON s.id = t.id
       WHERE t.status != 2
         AND t.due_date >= NOW()::DATE
         AND t.due_date < NOW()::DATE + INTERVAL '1 day'
       ORDER BY t.priority ASC, t.due_date ASC`,
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

export async function getCompletedTasks(userId: string, spaceId?: string): Promise<Task[]> {
  if (spaceId) {
    const { rows } = await sql.query(
      `WITH RECURSIVE descendants AS (
         SELECT id
         FROM ai_todo_tasks
         WHERE parent_id = $1
         UNION ALL
         SELECT t.id
         FROM ai_todo_tasks t
         JOIN descendants d ON t.parent_id = d.id
       ),
       scoped AS (
         SELECT id FROM ai_todo_tasks WHERE space_id = $1
         UNION
         SELECT id FROM descendants
       )
       SELECT t.*
       FROM ai_todo_tasks t
       JOIN scoped s ON s.id = t.id
       WHERE t.status = 2
       ORDER BY t.completed_at DESC
       LIMIT 20`,
      [spaceId]
    );
    return rows.map(rowToTask);
  }

  const { rows } = await sql`
    SELECT * FROM ai_todo_tasks
    WHERE user_id = ${userId} AND space_id IS NULL AND status = 2
    ORDER BY completed_at DESC
    LIMIT 20
  `;
  return rows.map(rowToTask);
}

export async function getTaskForUser(taskId: string, userId: string): Promise<Task | null> {
  const { rows } = await sql`
    SELECT t.* FROM ai_todo_tasks t
    WHERE t.id = ${taskId}
      AND (
        (t.space_id IS NULL AND t.user_id = ${userId})
        OR
        (t.space_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM ai_todo_task_members m
          WHERE m.task_id = t.space_id
            AND m.user_id = ${userId}
            AND m.status = 'active'
        ))
      )
  `;
  return rows[0] ? rowToTask(rows[0]) : null;
}

export interface CreateTaskData extends ParsedTask {
  spaceId?: string;
  assigneeId?: string;
  assigneeEmail?: string;
  mentionedEmails?: string[];
  parentId?: string;
  startDate?: string;
  endDate?: string;
}

export async function createTask(userId: string, data: CreateTaskData): Promise<Task> {
  const { rows } = await sql.query(
    `INSERT INTO ai_todo_tasks
       (user_id, title, description, due_date, priority, tags, space_id, assignee_id, assignee_email, mentioned_emails, parent_id, start_date, end_date, progress)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
    ]
  );
  return rowToTask(rows[0]);
}

export async function completeTask(taskId: string, userId: string): Promise<Task> {
  const task = await getTaskForUser(taskId, userId);
  if (!task) throw new Error("Task not found");

  const { rows } = await sql`
    UPDATE ai_todo_tasks SET status = 2, completed_at = NOW()
    WHERE id = ${taskId}
    RETURNING *
  `;
  await sql`
    UPDATE ai_todo_tasks SET status = 2, completed_at = NOW()
    WHERE parent_id = ${taskId} AND status = 0
  `;
  return rowToTask(rows[0]);
}

export async function deleteTask(taskId: string, userId: string): Promise<void> {
  const { rows: raw } = await sql`SELECT * FROM ai_todo_tasks WHERE id = ${taskId}`;
  if (!raw[0]) return;
  const task = rowToTask(raw[0]);

  if (task.space_id) {
    if (task.user_id !== userId) {
      const { rows: ownerRows } = await sql`
        SELECT 1 FROM ai_todo_task_members
        WHERE task_id = ${task.space_id} AND user_id = ${userId} AND role = 'owner'
      `;
      if (!ownerRows[0]) return;
    }
  } else {
    if (task.user_id !== userId) return;
  }

  await sql`DELETE FROM ai_todo_tasks WHERE id = ${taskId}`;
}

export async function updateTask(
  taskId: string,
  userId: string,
  patch: Partial<ParsedTask> & { assignee_email?: string | null; assigneeEmail?: string | null; start_date?: string | null; end_date?: string | null; parent_id?: string | null; progress?: number }
): Promise<Task | null> {
  const task = await getTaskForUser(taskId, userId);
  if (!task) return null;

  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (patch.title !== undefined) { fields.push(`title = $${idx++}`); values.push(patch.title); }
  if (patch.description !== undefined) { fields.push(`description = $${idx++}`); values.push(patch.description); }
  if (patch.due_date !== undefined) { fields.push(`due_date = $${idx++}`); values.push(patch.due_date); }
  if (patch.priority !== undefined) { fields.push(`priority = $${idx++}`); values.push(patch.priority); }
  if (patch.tags !== undefined) { fields.push(`tags = $${idx++}`); values.push(patch.tags); }
  const nextAssigneeEmail = ("assignee_email" in patch)
    ? patch.assignee_email
    : ("assigneeEmail" in patch ? patch.assigneeEmail : undefined);
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
  if (patch.start_date !== undefined) { fields.push(`start_date = $${idx++}`); values.push(patch.start_date); }
  if (patch.end_date !== undefined) { fields.push(`end_date = $${idx++}`); values.push(patch.end_date); }
  if (patch.progress !== undefined) { fields.push(`progress = $${idx++}`); values.push(patch.progress); }
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
  const { rows: existing } = await sql`SELECT 1 FROM ai_todo_tasks WHERE invite_code = ${inviteCode}`;
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
  const { rows: existing } = await sql`SELECT 1 FROM ai_todo_tasks WHERE invite_code = ${inviteCode}`;
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

  if (patch.title !== undefined) { fields.push(`title = $${idx++}`); values.push(patch.title); }
  if (patch.description !== undefined) { fields.push(`description = $${idx++}`); values.push(patch.description); }
  if (patch.invite_mode !== undefined) { fields.push(`invite_mode = $${idx++}`); values.push(patch.invite_mode); }

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
    SELECT * FROM ai_todo_task_members
    WHERE task_id = ${taskId}
    ORDER BY role ASC, joined_at ASC
  `;
  return rows.map(rowToMember);
}

export async function getTaskMemberRecord(taskId: string, userId: string): Promise<TaskMember | null> {
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

  if (patch.status !== undefined) { fields.push(`status = $${idx++}`); values.push(patch.status); }
  if (patch.display_name !== undefined) { fields.push(`display_name = $${idx++}`); values.push(patch.display_name); }
  if (patch.role !== undefined) { fields.push(`role = $${idx++}`); values.push(patch.role); }

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

export async function getDescendantTasks(parentId: string): Promise<Task[]> {
  const { rows } = await sql.query(
    `WITH RECURSIVE descendants AS (
       SELECT * FROM ai_todo_tasks WHERE parent_id = $1 OR space_id = $1
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

export async function getLogsForTasksByDate(
  taskIds: string[],
  date: string
): Promise<TaskLog[]> {
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

export async function getLogsForTasks(
  taskIds: string[],
  limit = 500
): Promise<TaskLog[]> {
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
