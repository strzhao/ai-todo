import type { Task } from "@/lib/types";

export type TaskNode = Task & { subtasks: TaskNode[] };

export function buildTree(tasks: Task[]): TaskNode[] {
  const map = new Map<string, TaskNode>(tasks.map((t) => [t.id, { ...t, subtasks: [] }]));
  const roots: TaskNode[] = [];
  for (const t of tasks) {
    if (t.parent_id && map.has(t.parent_id)) {
      map.get(t.parent_id)!.subtasks.push(map.get(t.id)!);
    } else {
      roots.push(map.get(t.id)!);
    }
  }
  return roots;
}
