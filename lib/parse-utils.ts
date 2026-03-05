import type { ParsedTask, ParsedAction } from "@/lib/types";

export const MAX_PARSE_CACHE_ENTRIES = 200;
export const CACHE_TTL_MS = 60_000;

export interface CacheEntry {
  expiresAt: number;
  actions: ParsedAction[];
}

export const parseCache = new Map<string, CacheEntry>();

export function cleanupCache(now = Date.now()): void {
  for (const [key, entry] of parseCache.entries()) {
    if (entry.expiresAt <= now) parseCache.delete(key);
  }
  if (parseCache.size <= MAX_PARSE_CACHE_ENTRIES) return;
  const staleFirst = [...parseCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  for (const [key] of staleFirst.slice(0, parseCache.size - MAX_PARSE_CACHE_ENTRIES)) {
    parseCache.delete(key);
  }
}

export function getNowMinuteKey(now: string): string {
  const d = new Date(now);
  return Number.isNaN(d.getTime()) ? now : d.toISOString().slice(0, 16);
}

export function parseItem(item: Record<string, unknown>, fallbackTitle: string): Omit<ParsedTask, "children"> {
  return {
    title: String(item.title || fallbackTitle),
    ...(item.description ? { description: String(item.description) } : {}),
    ...(item.due_date ? { due_date: String(item.due_date) } : {}),
    ...(item.start_date ? { start_date: String(item.start_date) } : {}),
    ...(item.end_date ? { end_date: String(item.end_date) } : {}),
    priority: (typeof item.priority === "number" && [0, 1, 2, 3].includes(item.priority))
      ? item.priority as 0 | 1 | 2 | 3
      : 2,
    tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    ...(item.assignee ? { assignee: String(item.assignee) } : {}),
    ...(item.parent_target_id ? { parent_target_id: String(item.parent_target_id) } : {}),
    ...(item.parent_target_title ? { parent_target_title: String(item.parent_target_title) } : {}),
    ...(Array.isArray(item.mentions) && item.mentions.length > 0
      ? { mentions: (item.mentions as unknown[]).map(String) }
      : {}),
  };
}

export function parseActions(result: Record<string, unknown>, fallbackText: string): ParsedAction[] {
  // New format: { actions: [...] }
  if (Array.isArray(result.actions)) {
    return (result.actions as Record<string, unknown>[]).map((a): ParsedAction => {
      const type = String(a.type ?? "create") as ParsedAction["type"];

      if (type === "create") {
        const rawTasks = Array.isArray(a.tasks) ? a.tasks as Record<string, unknown>[] : [];
        const tasks: ParsedTask[] = rawTasks.map((item, idx) => {
          const base = parseItem(item, idx === 0 ? fallbackText.slice(0, 100) : `任务 ${idx + 1}`);
          const children = Array.isArray(item.children) && item.children.length > 0
            ? (item.children as Record<string, unknown>[]).map((c, ci) => parseItem(c, `子任务 ${ci + 1}`))
            : undefined;
          return { ...base, ...(children ? { children } : {}) };
        });
        return { type: "create", tasks };
      }

      const action: ParsedAction = {
        type,
        ...(a.target_id ? { target_id: String(a.target_id) } : {}),
        ...(a.target_title ? { target_title: String(a.target_title) } : {}),
      };

      if (type === "update" && a.changes && typeof a.changes === "object") {
        const c = a.changes as Record<string, unknown>;
        action.changes = {
          ...(c.title !== undefined ? { title: String(c.title) } : {}),
          ...(c.description !== undefined ? { description: String(c.description) } : {}),
          ...(typeof c.priority === "number" && [0, 1, 2, 3].includes(c.priority) ? { priority: c.priority as 0 | 1 | 2 | 3 } : {}),
          ...(c.due_date ? { due_date: String(c.due_date) } : {}),
          ...(c.start_date ? { start_date: String(c.start_date) } : {}),
          ...(c.end_date ? { end_date: String(c.end_date) } : {}),
          ...(Array.isArray(c.tags) ? { tags: c.tags.map(String) } : {}),
          ...("assignee_email" in c && c.assignee_email !== undefined
            ? { assignee_email: c.assignee_email === null ? null : String(c.assignee_email) }
            : {}),
        };
      }

      if (type === "add_log" && a.log_content) {
        action.log_content = String(a.log_content);
      }

      if (type === "move") {
        if (a.to_parent_id) action.to_parent_id = String(a.to_parent_id);
        if (a.to_parent_title) action.to_parent_title = String(a.to_parent_title);
      }

      return action;
    });
  }

  // Legacy format: { tasks: [...] } — wrap as single create action
  const rawTasks = Array.isArray(result.tasks) ? result.tasks as Record<string, unknown>[] : [result];
  const tasks: ParsedTask[] = rawTasks.map((item, idx) => {
    const base = parseItem(item, idx === 0 ? fallbackText.slice(0, 100) : `任务 ${idx + 1}`);
    const children = Array.isArray(item.children) && item.children.length > 0
      ? (item.children as Record<string, unknown>[]).map((c, ci) => parseItem(c, `子任务 ${ci + 1}`))
      : undefined;
    return { ...base, ...(children ? { children } : {}) };
  });
  return [{ type: "create", tasks }];
}
