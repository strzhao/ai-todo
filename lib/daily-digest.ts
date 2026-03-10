import { sql } from "@vercel/postgres";
import type { Task, TaskLog } from "./types";

interface DigestData {
  overdueTasks: Task[];
  dueTodayTasks: Task[];
  completedYesterday: Task[];
  logsYesterday: Array<TaskLog & { task_title: string }>;
}

export async function getUserDigestData(userId: string, today: string): Promise<DigestData> {
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  // Overdue tasks (due_date < today, status=0, owned or assigned to user)
  const { rows: overdueRows } = await sql.query(
    `SELECT * FROM ai_todo_tasks
     WHERE status = 0
       AND due_date < $1::DATE
       AND (user_id = $2 OR assignee_id = $2)
     ORDER BY due_date ASC
     LIMIT 20`,
    [today, userId]
  );

  // Due today (due_date = today, status=0)
  const { rows: dueTodayRows } = await sql.query(
    `SELECT * FROM ai_todo_tasks
     WHERE status = 0
       AND due_date >= $1::DATE
       AND due_date < $1::DATE + INTERVAL '1 day'
       AND (user_id = $2 OR assignee_id = $2)
     ORDER BY priority ASC
     LIMIT 20`,
    [today, userId]
  );

  // Completed yesterday
  const { rows: completedRows } = await sql.query(
    `SELECT * FROM ai_todo_tasks
     WHERE status = 2
       AND completed_at >= $1::DATE
       AND completed_at < $1::DATE + INTERVAL '1 day'
       AND (user_id = $2 OR assignee_id = $2)
     ORDER BY completed_at ASC
     LIMIT 20`,
    [yesterdayStr, userId]
  );

  // Logs added yesterday by the user
  const { rows: logRows } = await sql.query(
    `SELECT l.*, t.title as task_title
     FROM ai_todo_task_logs l
     JOIN ai_todo_tasks t ON t.id = l.task_id
     WHERE l.user_id = $1
       AND l.created_at >= $2::DATE
       AND l.created_at < $2::DATE + INTERVAL '1 day'
     ORDER BY l.created_at ASC
     LIMIT 20`,
    [userId, yesterdayStr]
  );

  return {
    overdueTasks: overdueRows.map(rowToTask),
    dueTodayTasks: dueTodayRows.map(rowToTask),
    completedYesterday: completedRows.map(rowToTask),
    logsYesterday: logRows.map((r) => ({
      id: r.id as string,
      task_id: r.task_id as string,
      user_id: r.user_id as string,
      user_email: r.user_email as string,
      content: r.content as string,
      created_at: (r.created_at as Date).toISOString(),
      task_title: r.task_title as string,
    })),
  };
}

export function hasDigestContent(data: DigestData): boolean {
  return (
    data.overdueTasks.length > 0 ||
    data.dueTodayTasks.length > 0 ||
    data.completedYesterday.length > 0 ||
    data.logsYesterday.length > 0
  );
}

export function buildDigestSections(data: DigestData): Array<{ title: string; items: string[] }> {
  const sections: Array<{ title: string; items: string[] }> = [];

  if (data.overdueTasks.length > 0) {
    sections.push({
      title: "已过期任务",
      items: data.overdueTasks.map((t) => {
        const dueDate = t.due_date ? new Date(t.due_date).toLocaleDateString("zh-CN") : "";
        return `${t.title}${dueDate ? ` (截止 ${dueDate})` : ""}`;
      }),
    });
  }

  if (data.dueTodayTasks.length > 0) {
    sections.push({
      title: "今日到期",
      items: data.dueTodayTasks.map((t) => t.title),
    });
  }

  if (data.completedYesterday.length > 0) {
    sections.push({
      title: "昨日完成",
      items: data.completedYesterday.map((t) => t.title),
    });
  }

  if (data.logsYesterday.length > 0) {
    sections.push({
      title: "昨日进展",
      items: data.logsYesterday.map((l) => `${l.task_title}: ${l.content.slice(0, 80)}`),
    });
  }

  return sections;
}

// Minimal row-to-task mapper (avoids importing the full db.ts mapper)
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
    progress: row.progress != null ? Number(row.progress) : 0,
    parent_id: (row.parent_id as string) || undefined,
  };
}
