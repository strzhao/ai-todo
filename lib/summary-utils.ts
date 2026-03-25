import type { Task, TaskLog } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAIN_SPACE_CHAR_LIMIT = 20000;
export const LINKED_SPACES_TOTAL_CHAR_LIMIT = 15000;
export const MIN_SPACE_CHAR_LIMIT = 2000;

// ─── Budget allocation ────────────────────────────────────────────────────────

export function allocateCharBudget(totalBudget: number, spaceCount: number): number {
  if (spaceCount <= 0) return 0;
  return Math.max(MIN_SPACE_CHAR_LIMIT, Math.floor(totalBudget / spaceCount));
}

// ─── Active task detection ────────────────────────────────────────────────────

/**
 * Return IDs of tasks that had recent activity:
 * - tasks with logs in the last `days` days
 * - tasks completed on `date`
 */
export function getActiveTaskIds(
  tasks: Task[],
  logs: TaskLog[],
  date: string,
  days: number = 3,
): Set<string> {
  const cutoff = new Date(date);
  cutoff.setDate(cutoff.getDate() - days);

  const activeIds = new Set<string>();

  for (const log of logs) {
    if (new Date(log.created_at) >= cutoff) {
      activeIds.add(log.task_id);
    }
  }

  for (const task of tasks) {
    if (task.completed_at && task.completed_at.slice(0, 10) === date) {
      activeIds.add(task.id);
    }
    // Tasks with manual progress (1-99%) are actively being worked on
    if (task.progress > 0 && task.status !== 2) {
      activeIds.add(task.id);
    }
  }

  return activeIds;
}

// ─── Ancestor chain ───────────────────────────────────────────────────────────

export function getAncestorIds(taskId: string, tasks: Task[]): string[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const ancestors: string[] = [];
  let current = taskMap.get(taskId);
  while (current?.parent_id) {
    ancestors.push(current.parent_id);
    current = taskMap.get(current.parent_id);
  }
  return ancestors;
}

// ─── Log filtering ────────────────────────────────────────────────────────────

export function filterRecentLogs(
  logs: TaskLog[],
  date: string,
  days: number,
  maxPerTask: number,
): TaskLog[] {
  const cutoff = new Date(date);
  cutoff.setDate(cutoff.getDate() - days);

  const recent = logs
    .filter((l) => new Date(l.created_at) >= cutoff)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const perTask = new Map<string, number>();
  return recent.filter((l) => {
    const count = perTask.get(l.task_id) ?? 0;
    if (count >= maxPerTask) return false;
    perTask.set(l.task_id, count + 1);
    return true;
  });
}

// ─── Text truncation ──────────────────────────────────────────────────────────

export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 20) + "\n\n...(数据已截断)";
}

// ─── Smart task tree compression ─────────────────────────────────────────────

/**
 * Build a compressed task tree that preserves all top-level modules but collapses
 * inactive subtasks. Returns { text, compressed } where compressed=true if any
 * content was folded to stay within maxChars.
 *
 * Strategy (applied in rounds until within budget):
 * 1. Remove descriptions (` | ...` suffix)
 * 2. Collapse completed subtasks into summary lines
 * 3. Collapse deep (3+ level) inactive subtasks
 */
export function compressTaskTree(
  allTasks: Task[],
  rootId: string,
  nameMap: Map<string, string>,
  logs: TaskLog[],
  date: string,
  maxChars: number,
): { text: string; compressed: boolean } {
  // Build full tree first
  const rootTask = allTasks.find((t) => t.id === rootId);
  if (!rootTask) return { text: "", compressed: false };

  const fullTree = buildFullTreeText(allTasks, rootId, 1, nameMap, true);
  const rootLine = `- [${rootTask.status === 2 ? "已完成" : "待办"}][P${rootTask.priority}] ${rootTask.title}`;
  const fullText = `${rootLine}\n${fullTree}`;

  if (fullText.length <= maxChars) {
    return { text: fullText, compressed: false };
  }

  // Round 1: Remove descriptions
  const noDescTree = buildFullTreeText(allTasks, rootId, 1, nameMap, false);
  const noDescText = `${rootLine}\n${noDescTree}`;
  if (noDescText.length <= maxChars) {
    return { text: noDescText, compressed: true };
  }

  // Round 2: Use activity-based filtering (collapse inactive subtasks)
  const activeIds = getActiveTaskIds(allTasks, logs, date, 7);
  const relevantIds = new Set(activeIds);
  for (const id of activeIds) {
    for (const ancestorId of getAncestorIds(id, allTasks)) {
      relevantIds.add(ancestorId);
    }
  }
  // Always include all direct children of root (top-level modules)
  for (const t of allTasks) {
    if (t.parent_id === rootId || (t.space_id === rootId && !t.parent_id)) {
      relevantIds.add(t.id);
    }
  }
  relevantIds.add(rootId);

  const filteredTree = buildFilteredTaskTree(allTasks, rootId, 0, nameMap, relevantIds);
  if (filteredTree.length <= maxChars) {
    return { text: filteredTree, compressed: true };
  }

  // Round 3: Final truncation as last resort
  return { text: truncateText(filteredTree, maxChars), compressed: true };
}

function buildFullTreeText(
  allTasks: Task[],
  parentId: string,
  indent: number,
  nameMap: Map<string, string>,
  includeDesc: boolean,
): string {
  const children = allTasks.filter((t) =>
    t.parent_id === parentId || (t.space_id === parentId && !t.parent_id)
  );
  return children
    .map((t) => {
      const line = formatTaskLine(t, indent, nameMap, allTasks)
        + (includeDesc && t.description ? ` | ${t.description.slice(0, 80)}` : "");
      const childLines = buildFullTreeText(allTasks, t.id, indent + 1, nameMap, includeDesc);
      return childLines ? `${line}\n${childLines}` : line;
    })
    .join("\n");
}

// ─── Compressed space text builder ────────────────────────────────────────────

export function buildCompressedSpaceText(
  spaceTitle: string,
  tasks: Task[],
  logs: TaskLog[],
  date: string,
  nameMap: Map<string, string>,
  maxChars: number,
): string {
  // 1. Stats header
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 2).length;
  const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const todayCompleted = tasks.filter(
    (t) => t.completed_at?.slice(0, 10) === date,
  ).length;
  const todayLogs = logs.filter((l) => l.created_at.slice(0, 10) === date);

  let text = `### ${spaceTitle}\n`;
  text += `统计: 共 ${total} 任务，${completed} 完成(${completionPct}%)，今日完成 ${todayCompleted}，今日日志 ${todayLogs.length} 条\n\n`;

  // 2. Determine relevant (active + ancestor) IDs
  const activeIds = getActiveTaskIds(tasks, logs, date);
  const relevantIds = new Set(activeIds);
  for (const id of activeIds) {
    for (const ancestorId of getAncestorIds(id, tasks)) {
      relevantIds.add(ancestorId);
    }
  }
  // Root task is always relevant
  if (tasks.length > 0) {
    relevantIds.add(tasks[0].id);
  }

  // 3. Build filtered task tree
  text += buildFilteredTaskTree(tasks, tasks[0]?.id, 0, nameMap, relevantIds);

  // 4. Recent logs
  const recentLogs = filterRecentLogs(logs, date, 3, 3);
  if (recentLogs.length > 0) {
    const taskIdToTitle = new Map(tasks.map((t) => [t.id, t.title]));
    text += "\n\n进展日志:\n";
    for (const l of recentLogs) {
      const d = new Date(l.created_at);
      const userName =
        nameMap.get(l.user_email) ?? l.user_email.split("@")[0];
      const taskTitle = taskIdToTitle.get(l.task_id) ?? "未知";
      text += `- [${d.toLocaleDateString("zh-CN")} ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}] ${userName} → 任务「${taskTitle}」: ${l.content}\n`;
    }
  }

  return truncateText(text, maxChars);
}

// ─── Filtered task tree ──────────────────────────────────────────────────────

export function buildFilteredTaskTree(
  allTasks: Task[],
  parentId: string | undefined,
  indent: number,
  nameMap: Map<string, string>,
  relevantIds: Set<string>,
): string {
  // Get direct children of this parent
  const children = allTasks.filter((t) => {
    if (indent === 0) {
      // Root level: the root task itself
      return t.id === parentId;
    }
    return t.parent_id === parentId || (t.space_id === parentId && !t.parent_id);
  });

  const lines: string[] = [];

  // Separate relevant vs non-relevant children
  const relevant: Task[] = [];
  const nonRelevant: Task[] = [];

  for (const child of children) {
    if (relevantIds.has(child.id)) {
      relevant.push(child);
    } else {
      nonRelevant.push(child);
    }
  }

  // Render relevant children normally
  for (const t of relevant) {
    lines.push(formatTaskLine(t, indent, nameMap, allTasks));
    const childText = buildFilteredTaskTree(
      allTasks,
      t.id,
      indent + 1,
      nameMap,
      relevantIds,
    );
    if (childText) lines.push(childText);
  }

  // Collapse non-relevant into summary line
  if (nonRelevant.length > 0) {
    const completedCount = nonRelevant.filter((t) => t.status === 2).length;
    const pendingCount = nonRelevant.length - completedCount;
    const prefix = "  ".repeat(indent) + "- ";
    lines.push(
      `${prefix}[其他 ${nonRelevant.length} 个任务: ${completedCount} 完成 / ${pendingCount} 进行中]`,
    );
  }

  return lines.join("\n");
}

export function formatTaskLine(
  t: Task,
  indent: number,
  nameMap: Map<string, string>,
  allTasks: Task[],
): string {
  const status =
    t.status === 2
      ? `已完成${t.completed_at ? ` ${new Date(t.completed_at).toLocaleDateString("zh-CN")}` : ""}`
      : "待办";
  const priority = `P${t.priority}`;
  const due = t.due_date
    ? ` 截止:${new Date(t.due_date).toLocaleDateString("zh-CN")}`
    : "";
  const assignee = t.assignee_email
    ? ` @${nameMap.get(t.assignee_email) ?? t.assignee_email.split("@")[0]}`
    : "";
  const directChildren = allTasks.filter((c) => c.parent_id === t.id);
  let prog: string;
  if (directChildren.length > 0) {
    const done = directChildren.filter((c) => c.status === 2).length;
    prog = ` 完成:${done}/${directChildren.length}(${Math.round((done / directChildren.length) * 100)}%)`;
  } else {
    prog = t.progress > 0 ? ` 进度:${t.progress}%` : "";
  }
  const prefix = "  ".repeat(indent) + "- ";
  return `${prefix}[${status}][${priority}] ${t.title}${due}${assignee}${prog}`;
}
