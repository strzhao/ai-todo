import { sql } from "@vercel/postgres";
import type { Task, ParsedTask } from "./types";

export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS ai_todo_tasks (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     TEXT NOT NULL,
      title       TEXT NOT NULL,
      description TEXT,
      due_date    TIMESTAMPTZ,
      priority    SMALLINT DEFAULT 2,
      status      SMALLINT DEFAULT 0,
      tags        TEXT[] DEFAULT '{}',
      sort_order  INTEGER DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_ai_todo_tasks_user_id ON ai_todo_tasks(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ai_todo_tasks_due ON ai_todo_tasks(user_id, due_date)`;
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    title: row.title as string,
    description: row.description as string | undefined,
    due_date: row.due_date ? (row.due_date as Date).toISOString() : undefined,
    priority: row.priority as Task["priority"],
    status: row.status as Task["status"],
    tags: row.tags as string[],
    sort_order: row.sort_order as number,
    created_at: (row.created_at as Date).toISOString(),
    completed_at: row.completed_at ? (row.completed_at as Date).toISOString() : undefined,
  };
}

export async function getTasks(userId: string): Promise<Task[]> {
  const { rows } = await sql`
    SELECT * FROM ai_todo_tasks
    WHERE user_id = ${userId} AND status != 2
    ORDER BY priority ASC, created_at DESC
  `;
  return rows.map(rowToTask);
}

export async function getTodayTasks(userId: string): Promise<Task[]> {
  const { rows } = await sql`
    SELECT * FROM ai_todo_tasks
    WHERE user_id = ${userId}
      AND status != 2
      AND due_date >= NOW()::DATE
      AND due_date < NOW()::DATE + INTERVAL '1 day'
    ORDER BY priority ASC, due_date ASC
  `;
  return rows.map(rowToTask);
}

export async function createTask(userId: string, data: ParsedTask): Promise<Task> {
  const { rows } = await sql.query(
    `INSERT INTO ai_todo_tasks (user_id, title, description, due_date, priority, tags)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, data.title, data.description ?? null, data.due_date ?? null, data.priority ?? 2, data.tags ?? []]
  );
  return rowToTask(rows[0]);
}

export async function completeTask(userId: string, id: string): Promise<Task> {
  const { rows } = await sql`
    UPDATE ai_todo_tasks
    SET status = 2, completed_at = NOW()
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING *
  `;
  return rowToTask(rows[0]);
}

export async function deleteTask(userId: string, id: string): Promise<void> {
  await sql`DELETE FROM ai_todo_tasks WHERE id = ${id} AND user_id = ${userId}`;
}

export async function updateTask(userId: string, id: string, patch: Partial<ParsedTask>): Promise<Task> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (patch.title !== undefined) { fields.push(`title = $${idx++}`); values.push(patch.title); }
  if (patch.description !== undefined) { fields.push(`description = $${idx++}`); values.push(patch.description); }
  if (patch.due_date !== undefined) { fields.push(`due_date = $${idx++}`); values.push(patch.due_date); }
  if (patch.priority !== undefined) { fields.push(`priority = $${idx++}`); values.push(patch.priority); }
  if (patch.tags !== undefined) { fields.push(`tags = $${idx++}`); values.push(patch.tags); }

  if (fields.length === 0) {
    const { rows } = await sql`SELECT * FROM ai_todo_tasks WHERE id = ${id} AND user_id = ${userId}`;
    return rowToTask(rows[0]);
  }

  const { rows } = await sql.query(
    `UPDATE ai_todo_tasks SET ${fields.join(", ")} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`,
    [...values, id, userId]
  );
  return rowToTask(rows[0]);
}
