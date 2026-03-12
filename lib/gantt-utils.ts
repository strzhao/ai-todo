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
