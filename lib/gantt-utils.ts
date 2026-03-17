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
  // start_date + (end_date || due_date) → 跨天范围
  const effectiveEnd = task.end_date || (task.start_date && task.due_date ? task.due_date : null);
  if (task.start_date && effectiveEnd) {
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    const dayEnd = dayStart + 86400000;
    const s = new Date(task.start_date).getTime();
    const e = new Date(effectiveEnd).getTime();
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
  // start_date + (end_date || due_date) → 跨天范围
  const effectiveEnd = task.end_date || (task.start_date && task.due_date ? task.due_date : null);
  if (task.start_date && effectiveEnd) {
    const s = new Date(task.start_date).getTime();
    const e = new Date(effectiveEnd).getTime();
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

/* ---------- TaskBar layout for dual-layer gantt ---------- */

export interface TaskBar {
  task: Task;
  startCol: number;  // 0-6, clamped to visible week
  spanCols: number;  // 1-7
  row: number;       // vertical stacking row index
}

/**
 * Compute horizontal bar positions for tasks within a 7-day week.
 * Returns TaskBar[] with greedy row packing (no overlaps).
 */
export function computeTaskBars(weekTasks: Task[], days: Date[]): TaskBar[] {
  if (days.length !== 7) return [];

  const dayStarts = days.map((d) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
  );

  const bars: Omit<TaskBar, "row">[] = [];

  for (const task of weekTasks) {
    let startCol = -1;
    let endCol = -1;

    for (let i = 0; i < 7; i++) {
      if (taskCoversDay(task, days[i])) {
        if (startCol === -1) startCol = i;
        endCol = i;
      }
    }

    if (startCol === -1) continue; // task doesn't cover any day in this week

    bars.push({
      task,
      startCol,
      spanCols: endCol - startCol + 1,
    });
  }

  // Sort by startCol then by wider spans first (for better packing)
  bars.sort((a, b) => a.startCol - b.startCol || b.spanCols - a.spanCols);

  // Greedy row assignment
  const rows: boolean[][] = []; // rows[r][col] = occupied

  const result: TaskBar[] = [];

  for (const bar of bars) {
    let assignedRow = -1;
    for (let r = 0; r < rows.length; r++) {
      let conflict = false;
      for (let c = bar.startCol; c < bar.startCol + bar.spanCols; c++) {
        if (rows[r][c]) { conflict = true; break; }
      }
      if (!conflict) { assignedRow = r; break; }
    }

    if (assignedRow === -1) {
      assignedRow = rows.length;
      rows.push(new Array(7).fill(false));
    }

    // Mark columns occupied
    for (let c = bar.startCol; c < bar.startCol + bar.spanCols; c++) {
      rows[assignedRow][c] = true;
    }

    result.push({ ...bar, row: assignedRow });
  }

  return result;
}
