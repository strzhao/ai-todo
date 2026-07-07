import type { ParsedAction } from "@/lib/types";

const AI_FLOW_PREFIX = "[AI_FLOW]";
const MAX_TEXT_LENGTH = 120;
const MAX_ARRAY_ITEMS = 20;
const MAX_DEPTH = 4;

export function isAiFlowDebug(): boolean {
  return process.env.NODE_ENV === "development";
}

export function createAiTraceId(): string {
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getAiTraceIdFromHeaders(headers: Headers): string | undefined {
  return headers.get("x-ai-trace-id") ?? undefined;
}

function clipValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return value.length > MAX_TEXT_LENGTH ? `${value.slice(0, MAX_TEXT_LENGTH)}...` : value;
  }

  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }

  if (depth > MAX_DEPTH) return "[depth_limited]";

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => clipValue(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      return { items, remaining_count: value.length - MAX_ARRAY_ITEMS };
    }
    return items;
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = clipValue(item, depth + 1);
  }
  return out;
}

export function aiFlowLog(scope: string, payload: Record<string, unknown>): void {
  if (!isAiFlowDebug()) return;
  try {
    console.log(AI_FLOW_PREFIX, scope, clipValue(payload));
  } catch (err) {
    console.log(AI_FLOW_PREFIX, scope, { log_error: String(err) });
  }
}

export function summarizeParsedActions(actions: ParsedAction[]): Array<Record<string, unknown>> {
  return actions.map((action) => {
    if (action.type === "create") {
      const tasks = action.tasks ?? [];
      return {
        type: action.type,
        task_count: tasks.length,
        tasks: tasks.map((t) => ({
          title: t.title,
          parent_target_id: t.parent_target_id,
          parent_target_title: t.parent_target_title,
          children_count: t.children?.length ?? 0,
        })),
      };
    }

    if (action.type === "update") {
      return {
        type: action.type,
        target_id: action.target_id,
        target_title: action.target_title,
        change_keys: action.changes ? Object.keys(action.changes).sort() : [],
      };
    }

    if (action.type === "move") {
      return {
        type: action.type,
        target_id: action.target_id,
        target_title: action.target_title,
        to_parent_id: action.to_parent_id,
        to_parent_title: action.to_parent_title,
      };
    }

    if (action.type === "add_log") {
      return {
        type: action.type,
        target_id: action.target_id,
        target_title: action.target_title,
        has_log_content: Boolean(action.log_content),
      };
    }

    return {
      type: action.type,
      target_id: action.target_id,
      target_title: action.target_title,
    };
  });
}
