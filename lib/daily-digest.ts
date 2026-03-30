import { sql } from "@vercel/postgres";
import type {
  AppNotificationData,
  DailyDigestMetric,
  DailyDigestSection,
  DailyDigestSectionItem,
  DailyDigestSnapshot,
  Task,
  TaskLog,
} from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOTIFICATION_ITEM_LIMIT = 4;
const EMAIL_ITEM_LIMIT = 20;

type DigestSectionKey = DailyDigestMetric["key"];
type DigestLogEntry = TaskLog & { task_title: string; space_id?: string };

export interface DigestData {
  overdueTasks: Task[];
  dueTodayTasks: Task[];
  completedYesterday: Task[];
  logsYesterday: DigestLogEntry[];
  spaceNames: Record<string, string>;
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
    `SELECT l.*, t.title as task_title, t.space_id as space_id
     FROM ai_todo_task_logs l
     JOIN ai_todo_tasks t ON t.id = l.task_id
     WHERE l.user_id = $1
       AND l.created_at >= $2::DATE
       AND l.created_at < $2::DATE + INTERVAL '1 day'
     ORDER BY l.created_at ASC
     LIMIT 20`,
    [userId, yesterdayStr]
  );

  const overdueTasks = overdueRows.map(rowToTask);
  const dueTodayTasks = dueTodayRows.map(rowToTask);
  const completedYesterday = completedRows.map(rowToTask);
  const logsYesterday = logRows.map((r) => ({
    id: r.id as string,
    task_id: r.task_id as string,
    user_id: r.user_id as string,
    user_email: r.user_email as string,
    content: r.content as string,
    created_at: (r.created_at as Date).toISOString(),
    task_title: r.task_title as string,
    space_id: (r.space_id as string) || undefined,
  }));

  const spaceIds = [...new Set(
    [...overdueTasks, ...dueTodayTasks, ...completedYesterday]
      .map((t) => t.space_id)
      .concat(logsYesterday.map((l) => l.space_id))
      .filter(Boolean)
  )] as string[];
  const spaceNames = await getSpaceNames(spaceIds);

  return {
    overdueTasks,
    dueTodayTasks,
    completedYesterday,
    logsYesterday,
    spaceNames,
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

export function buildDailyDigestSnapshot(data: DigestData, today: string): DailyDigestSnapshot {
  const metrics = buildDigestMetrics(data);
  const sections = [
    buildTaskSection("overdue", "已过期任务", data.overdueTasks, data.spaceNames, today, NOTIFICATION_ITEM_LIMIT),
    buildTaskSection("due_today", "今日到期", data.dueTodayTasks, data.spaceNames, today, NOTIFICATION_ITEM_LIMIT),
    buildTaskSection("completed", "昨日完成", data.completedYesterday, data.spaceNames, today, NOTIFICATION_ITEM_LIMIT),
    buildLogSection(data.logsYesterday, data.spaceNames, NOTIFICATION_ITEM_LIMIT),
  ].filter((section): section is DailyDigestSection => !!section);

  return {
    date: today,
    headline: buildDigestHeadline(metrics),
    metrics,
    sections,
  };
}

export function buildDigestPreviewText(snapshot: DailyDigestSnapshot): string {
  const countOf = (key: DigestSectionKey) =>
    snapshot.metrics.find((metric) => metric.key === key)?.count ?? 0;
  const fragments = [
    countOf("overdue") > 0 ? `${countOf("overdue")} 个逾期` : null,
    countOf("due_today") > 0 ? `今天 ${countOf("due_today")} 个到期` : null,
    countOf("completed") > 0 ? `昨天完成 ${countOf("completed")} 个` : null,
    countOf("logs") > 0 ? `新增 ${countOf("logs")} 条进展` : null,
  ].filter(Boolean);

  return fragments.join("，") || snapshot.headline;
}

export function buildDailyDigestNotification(
  data: DigestData,
  today: string
): { title: string; body: string; data: AppNotificationData } {
  const snapshot = buildDailyDigestSnapshot(data, today);
  return {
    title: `每日摘要 · ${today}`,
    body: buildDigestPreviewText(snapshot),
    data: { daily_digest: snapshot },
  };
}

export function buildDigestSections(
  data: DigestData,
  today = new Date().toISOString().slice(0, 10)
): Array<{ title: string; items: string[] }> {
  const sections: Array<{ title: string; items: string[] }> = [];

  if (data.overdueTasks.length > 0) {
    sections.push({
      title: "已过期任务",
      items: data.overdueTasks
        .slice(0, EMAIL_ITEM_LIMIT)
        .map((task) => formatDigestTaskLine(task, data.spaceNames, "overdue", today)),
    });
  }

  if (data.dueTodayTasks.length > 0) {
    sections.push({
      title: "今日到期",
      items: data.dueTodayTasks
        .slice(0, EMAIL_ITEM_LIMIT)
        .map((task) => formatDigestTaskLine(task, data.spaceNames, "due_today", today)),
    });
  }

  if (data.completedYesterday.length > 0) {
    sections.push({
      title: "昨日完成",
      items: data.completedYesterday
        .slice(0, EMAIL_ITEM_LIMIT)
        .map((task) => formatDigestTaskLine(task, data.spaceNames, "completed", today)),
    });
  }

  if (data.logsYesterday.length > 0) {
    sections.push({
      title: "昨日进展",
      items: data.logsYesterday
        .slice(0, EMAIL_ITEM_LIMIT)
        .map((log) => formatDigestLogLine(log, data.spaceNames)),
    });
  }

  return sections;
}

// ─── Personal Day Summary Data ───────────────────────────────────────────────

export interface PersonalDaySummaryData {
  [key: string]: unknown;
  completedTasks: Task[];
  createdTasks: Task[];
  logs: Array<TaskLog & { task_title: string; space_id?: string }>;
  overdueTasks: Task[];
  dueTodayTasks: Task[];
  spaceNames: Record<string, string>;
}

export async function getPersonalDaySummaryData(
  userId: string,
  date: string
): Promise<PersonalDaySummaryData> {
  // Run all 5 queries in parallel for better latency
  const [
    { rows: completedRows },
    { rows: createdRows },
    { rows: logRows },
    { rows: overdueRows },
    { rows: dueTodayRows },
  ] = await Promise.all([
    // 1. Tasks completed on date
    sql`
      SELECT * FROM ai_todo_tasks
      WHERE status = 2
        AND completed_at >= ${date}::DATE
        AND completed_at < ${date}::DATE + INTERVAL '1 day'
        AND (user_id = ${userId} OR assignee_id = ${userId})
      ORDER BY completed_at ASC
      LIMIT 30
    `,
    // 2. Tasks created on date
    sql.query(
      `SELECT * FROM ai_todo_tasks
       WHERE created_at >= $1::DATE
         AND created_at < $1::DATE + INTERVAL '1 day'
         AND user_id = $2
       ORDER BY created_at ASC
       LIMIT 30`,
      [date, userId]
    ),
    // 3. Task logs added on date by userId
    sql.query(
      `SELECT l.*, t.title as task_title, t.space_id as space_id
       FROM ai_todo_task_logs l
       JOIN ai_todo_tasks t ON t.id = l.task_id
       WHERE l.user_id = $1
         AND l.created_at >= $2::DATE
         AND l.created_at < $2::DATE + INTERVAL '1 day'
       ORDER BY l.created_at ASC
       LIMIT 30`,
      [userId, date]
    ),
    // 4. Overdue tasks
    sql.query(
      `SELECT * FROM ai_todo_tasks
       WHERE status = 0
         AND due_date < $1::DATE
         AND (user_id = $2 OR assignee_id = $2)
       ORDER BY due_date ASC
       LIMIT 30`,
      [date, userId]
    ),
    // 5. Tasks due on date
    sql.query(
      `SELECT * FROM ai_todo_tasks
       WHERE status = 0
         AND due_date >= $1::DATE
         AND due_date < $1::DATE + INTERVAL '1 day'
         AND (user_id = $2 OR assignee_id = $2)
       ORDER BY priority ASC
       LIMIT 30`,
      [date, userId]
    ),
  ]);

  const completedTasks = completedRows.map(rowToTask);
  const createdTasks = createdRows.map(rowToTask);
  const overdueTasks = overdueRows.map(rowToTask);
  const dueTodayTasks = dueTodayRows.map(rowToTask);

  const logs = logRows.map((r) => ({
    id: r.id as string,
    task_id: r.task_id as string,
    user_id: r.user_id as string,
    user_email: r.user_email as string,
    content: r.content as string,
    created_at: (r.created_at as Date).toISOString(),
    task_title: r.task_title as string,
    space_id: (r.space_id as string) || undefined,
  }));

  // Collect all unique space_ids
  const spaceIds = [...new Set(
    [...completedTasks, ...createdTasks, ...overdueTasks, ...dueTodayTasks]
      .map((t) => t.space_id)
      .concat(logs.map((log) => log.space_id))
      .filter(Boolean)
  )] as string[];
  const spaceNames = await getSpaceNames(spaceIds);

  return { completedTasks, createdTasks, logs, overdueTasks, dueTodayTasks, spaceNames };
}

export function hasPersonalDayContent(data: { completedTasks: unknown[]; createdTasks: unknown[]; logs: unknown[]; overdueTasks: unknown[]; dueTodayTasks: unknown[] }): boolean {
  return (
    data.completedTasks.length > 0 ||
    data.createdTasks.length > 0 ||
    data.logs.length > 0 ||
    data.overdueTasks.length > 0 ||
    data.dueTodayTasks.length > 0
  );
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
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ""),
    completed_at: row.completed_at ? (row.completed_at instanceof Date ? row.completed_at.toISOString() : String(row.completed_at)) : undefined,
    space_id: (row.space_id as string) || undefined,
    assignee_id: (row.assignee_id as string) || undefined,
    assignee_email: (row.assignee_email as string) || undefined,
    progress: row.progress != null ? Number(row.progress) : 0,
    parent_id: (row.parent_id as string) || undefined,
  };
}

async function getSpaceNames(spaceIds: string[]): Promise<Record<string, string>> {
  if (spaceIds.length === 0) return {};

  const placeholders = spaceIds.map((_, i) => `$${i + 1}`).join(",");
  const { rows } = await sql.query(
    `SELECT id, title FROM ai_todo_tasks WHERE id IN (${placeholders})`,
    spaceIds
  );

  const spaceNames: Record<string, string> = {};
  for (const row of rows) {
    spaceNames[row.id as string] = row.title as string;
  }
  return spaceNames;
}

function buildDigestMetrics(data: DigestData): DailyDigestMetric[] {
  return [
    { key: "overdue", label: "逾期", count: data.overdueTasks.length },
    { key: "due_today", label: "今日到期", count: data.dueTodayTasks.length },
    { key: "completed", label: "昨日完成", count: data.completedYesterday.length },
    { key: "logs", label: "昨日进展", count: data.logsYesterday.length },
  ];
}

function buildDigestHeadline(metrics: DailyDigestMetric[]): string {
  const countOf = (key: DigestSectionKey) =>
    metrics.find((metric) => metric.key === key)?.count ?? 0;
  const overdue = countOf("overdue");
  const dueToday = countOf("due_today");
  const completed = countOf("completed");
  const logs = countOf("logs");

  if (overdue > 0 && dueToday > 0) {
    return `先处理 ${overdue} 个逾期任务，今天还有 ${dueToday} 个到期`;
  }
  if (overdue > 0) {
    return `先处理 ${overdue} 个逾期任务`;
  }
  if (dueToday > 0) {
    return `今天有 ${dueToday} 个任务到期`;
  }
  if (completed > 0 && logs > 0) {
    return `昨天完成 ${completed} 个任务，并记录了 ${logs} 条进展`;
  }
  if (completed > 0) {
    return `昨天完成了 ${completed} 个任务`;
  }
  if (logs > 0) {
    return `昨天记录了 ${logs} 条进展`;
  }
  return "今天继续保持节奏";
}

function buildTaskSection(
  key: Exclude<DigestSectionKey, "logs">,
  title: string,
  tasks: Task[],
  spaceNames: Record<string, string>,
  today: string,
  itemLimit: number
): DailyDigestSection | null {
  if (tasks.length === 0) return null;

  const items = tasks.slice(0, itemLimit).map((task) =>
    buildTaskSectionItem(task, spaceNames, key, today)
  );

  return {
    key,
    title,
    count: tasks.length,
    overflow_count: Math.max(0, tasks.length - items.length),
    items,
  };
}

function buildLogSection(
  logs: DigestLogEntry[],
  spaceNames: Record<string, string>,
  itemLimit: number
): DailyDigestSection | null {
  if (logs.length === 0) return null;

  const items = logs.slice(0, itemLimit).map((log) => buildLogSectionItem(log, spaceNames));
  return {
    key: "logs",
    title: "昨日进展",
    count: logs.length,
    overflow_count: Math.max(0, logs.length - items.length),
    items,
  };
}

function buildTaskSectionItem(
  task: Task,
  spaceNames: Record<string, string>,
  kind: Exclude<DigestSectionKey, "logs">,
  today: string
): DailyDigestSectionItem {
  const spaceName = task.space_id ? spaceNames[task.space_id] : undefined;
  const metaParts: string[] = [];

  if (spaceName) metaParts.push(spaceName);
  metaParts.push(`P${task.priority}`);

  if (kind === "overdue") {
    const overdueDays = getOverdueDays(today, task.due_date);
    if (task.due_date) {
      metaParts.push(`截止 ${formatDateLabel(task.due_date)}`);
    }
    if (overdueDays > 0) {
      metaParts.push(`逾期 ${overdueDays} 天`);
    }
  } else if (kind === "due_today") {
    metaParts.push("今日到期");
  } else if (kind === "completed") {
    metaParts.push("昨日完成");
  }

  if (task.status === 0 && task.progress > 0) {
    metaParts.push(`进度 ${task.progress}%`);
  }

  return {
    kind: "task",
    task_id: task.id,
    space_id: task.space_id,
    space_name: spaceName,
    title: task.title,
    meta: metaParts.join(" · "),
    due_date: task.due_date,
    priority: task.priority,
    progress: task.progress,
    completed_at: task.completed_at,
  };
}

function buildLogSectionItem(
  log: DigestLogEntry,
  spaceNames: Record<string, string>
): DailyDigestSectionItem {
  const spaceName = log.space_id ? spaceNames[log.space_id] : undefined;
  const metaParts = [spaceName, "进展记录"].filter(Boolean) as string[];

  return {
    kind: "log",
    task_id: log.task_id,
    space_id: log.space_id,
    space_name: spaceName,
    title: log.task_title,
    meta: metaParts.join(" · "),
    excerpt: truncateText(log.content, 120),
  };
}

function formatDigestTaskLine(
  task: Task,
  spaceNames: Record<string, string>,
  kind: Exclude<DigestSectionKey, "logs">,
  today: string
): string {
  const spaceName = task.space_id ? spaceNames[task.space_id] : undefined;
  const suffix: string[] = [];

  if (spaceName) suffix.push(`[${spaceName}]`);
  suffix.push(`[P${task.priority}]`);

  if (kind === "overdue") {
    const overdueDays = getOverdueDays(today, task.due_date);
    if (task.due_date) suffix.push(`截止 ${formatDateLabel(task.due_date)}`);
    if (overdueDays > 0) suffix.push(`逾期 ${overdueDays} 天`);
  } else if (kind === "due_today") {
    suffix.push("今日到期");
  } else {
    suffix.push("昨日完成");
  }

  return `${task.title} ${suffix.join(" · ")}`.trim();
}

function formatDigestLogLine(
  log: DigestLogEntry,
  spaceNames: Record<string, string>
): string {
  const spaceName = log.space_id ? spaceNames[log.space_id] : undefined;
  const prefix = spaceName ? `${log.task_title} [${spaceName}]` : log.task_title;
  return `${prefix}: ${truncateText(log.content, 80)}`;
}

function formatDateLabel(dateStr?: string): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("zh-CN");
}

function getOverdueDays(today: string, dueDate?: string): number {
  if (!dueDate) return 0;
  const dueDay = dueDate.slice(0, 10);
  const diff = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDay}T00:00:00Z`);
  return diff > 0 ? Math.floor(diff / MS_PER_DAY) : 0;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}
