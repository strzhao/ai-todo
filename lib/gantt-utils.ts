import type { Task, SpaceMember } from "@/lib/types";
import { getDisplayLabel } from "@/lib/display-utils";

export function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86400000;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

export function formatAxisDate(date: Date): string {
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export function getMemberName(email: string, members: SpaceMember[]): string {
  const m = members.find((mb) => mb.email === email);
  return getDisplayLabel(email, m);
}

export interface MemberGroup {
  member: SpaceMember | null;
  label: string;
  tasks: Task[];
}

function getTaskSortDate(t: Task): number {
  if (t.start_date) return new Date(t.start_date).getTime();
  if (t.due_date) return new Date(t.due_date).getTime();
  return new Date(t.created_at).getTime();
}

/** 计算指定偏移量的周一日期（中国习惯周一起始） */
export function getWeekStartMonday(baseDate: Date, weekOffset: number): Date {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const dow = d.getDay(); // 0=周日
  const mondayDelta = dow === 0 ? -6 : 1 - dow;
  return addDays(d, mondayDelta + weekOffset * 7);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

/** 判断任务是否覆盖某一天（日期粒度） */
export function taskCoversDay(task: Task, day: Date): boolean {
  if (task.start_date && task.end_date) {
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    const dayEnd = dayStart + 86400000;
    const s = new Date(task.start_date).getTime();
    const e = new Date(task.end_date).getTime();
    return s < dayEnd && e >= dayStart;
  }
  if (task.start_date) {
    return isSameDay(new Date(task.start_date), day);
  }
  if (task.due_date) {
    return isSameDay(new Date(task.due_date), day);
  }
  return false;
}

/** 判断任务是否与一个时间区间重叠（避免对每天重复调用 taskCoversDay） */
export function taskCoversRange(task: Task, rangeStartMs: number, rangeEndMs: number): boolean {
  if (task.start_date && task.end_date) {
    const s = new Date(task.start_date).getTime();
    const e = new Date(task.end_date).getTime();
    return s < rangeEndMs && e >= rangeStartMs;
  }
  if (task.start_date) {
    const s = new Date(task.start_date).getTime();
    return s >= rangeStartMs && s < rangeEndMs;
  }
  if (task.due_date) {
    const d = new Date(task.due_date).getTime();
    return d >= rangeStartMs && d < rangeEndMs;
  }
  return false;
}

export interface GanttRow {
  rootTask: Task;           // 一级任务
  children: Task[];         // 所有后代中有排期的（按 start_date 排序）
  unscheduledCount: number; // 无排期子任务数
}

/** 将 flat Task[] 按一级任务分组，子任务归入对应一级任务行 */
export function groupByTopLevel(tasks: Task[]): GanttRow[] {
  // 1. 识别一级任务：没有 parent_id 或 parent_id 等于 space_id
  const topLevel: Task[] = [];
  const childMap = new Map<string, Task[]>(); // parentId → direct children

  for (const t of tasks) {
    if (!t.parent_id || t.parent_id === t.space_id) {
      topLevel.push(t);
    } else {
      const list = childMap.get(t.parent_id);
      if (list) list.push(t);
      else childMap.set(t.parent_id, [t]);
    }
  }

  // 2. 递归收集所有后代
  function collectDescendants(parentId: string): Task[] {
    const direct = childMap.get(parentId);
    if (!direct) return [];
    const result: Task[] = [];
    for (const child of direct) {
      result.push(child);
      result.push(...collectDescendants(child.id));
    }
    return result;
  }

  // 3. 组装 GanttRow
  const rows: GanttRow[] = [];
  for (const root of topLevel) {
    const descendants = collectDescendants(root.id);
    const scheduled = descendants.filter(
      (t) => t.start_date || t.end_date || t.due_date
    );
    const unscheduledCount = descendants.length - scheduled.length;

    // 按 start_date 排序
    scheduled.sort((a, b) => getTaskSortDate(a) - getTaskSortDate(b));

    rows.push({ rootTask: root, children: scheduled, unscheduledCount });
  }

  // 按一级任务的排期时间排序（有排期的在前，无排期的在后）
  rows.sort((a, b) => {
    const aHasDate = !!(a.rootTask.start_date || a.rootTask.end_date || a.rootTask.due_date);
    const bHasDate = !!(b.rootTask.start_date || b.rootTask.end_date || b.rootTask.due_date);
    if (aHasDate !== bHasDate) return aHasDate ? -1 : 1;
    // 有子任务排期的也视为有日期
    if (!aHasDate && !bHasDate) {
      if (a.children.length !== b.children.length) return b.children.length - a.children.length;
    }
    return getTaskSortDate(a.rootTask) - getTaskSortDate(b.rootTask);
  });

  return rows;
}

export function groupTasksByMember(
  tasks: Task[],
  members: SpaceMember[],
): MemberGroup[] {
  const byEmail = new Map<string, Task[]>();
  const unassigned: Task[] = [];

  for (const t of tasks) {
    if (t.assignee_email) {
      const list = byEmail.get(t.assignee_email);
      if (list) list.push(t);
      else byEmail.set(t.assignee_email, [t]);
    } else {
      unassigned.push(t);
    }
  }

  const result: MemberGroup[] = [];
  for (const m of members.filter((m) => m.status === "active")) {
    const memberTasks = byEmail.get(m.email);
    if (memberTasks?.length) {
      memberTasks.sort((a, b) => getTaskSortDate(a) - getTaskSortDate(b));
      result.push({
        member: m,
        label: getDisplayLabel(m.email, m),
        tasks: memberTasks,
      });
    }
  }

  if (unassigned.length > 0) {
    unassigned.sort((a, b) => getTaskSortDate(a) - getTaskSortDate(b));
    result.push({ member: null, label: "未指派", tasks: unassigned });
  }

  return result;
}
