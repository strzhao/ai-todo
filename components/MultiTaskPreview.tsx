"use client";

import { useState } from "react";
import { ParsePreviewCard } from "@/components/ParsePreviewCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { aiFlowLog } from "@/lib/ai-flow-log";
import type { ParsedTask, Task } from "@/lib/types";

const PRIORITY_LABELS: Record<number, string> = { 0: "P0", 1: "P1", 2: "P2", 3: "P3" };
const PRIORITY_COLORS: Record<number, string> = {
  0: "bg-danger-soft text-danger border-danger/35",
  1: "bg-warning-soft text-warning border-warning/40",
  2: "bg-info-soft text-info border-info/35",
  3: "bg-neutral-soft text-charcoal border-border/70",
};

interface Props {
  tasks: ParsedTask[];
  raw: string;
  onConfirm: (created: Task[]) => void;
  onCancel: () => void;
  allTasks: Task[];
  spaceId?: string;
  parentTaskId?: string;
  traceId?: string;
}

function resolveTaskByTarget(allTasks: Task[], targetId?: string, targetTitle?: string): Task | null {
  if (targetId) {
    const exact = allTasks.find((t) => t.id === targetId);
    if (exact) return exact;
  }
  if (targetTitle) {
    const q = targetTitle.toLowerCase();
    return allTasks.find(
      (t) => t.title.toLowerCase().includes(q) || q.includes(t.title.toLowerCase())
    ) ?? null;
  }
  return null;
}

function resolveCreateParentTask(parsed: Omit<ParsedTask, "children">, allTasks: Task[], parentTaskId?: string): Task | null | undefined {
  if (parentTaskId) return { id: parentTaskId } as Task;
  if (!parsed.parent_target_id && !parsed.parent_target_title) return undefined;
  return resolveTaskByTarget(allTasks, parsed.parent_target_id, parsed.parent_target_title);
}

function shortTitle(title: string, max = 14): string {
  return title.length > max ? `${title.slice(0, max)}...` : title;
}

export function MultiTaskPreview({ tasks, raw, onConfirm, onCancel, allTasks, spaceId, parentTaskId, traceId }: Props) {
  const focusedParentTitle = parentTaskId
    ? (allTasks.find((t) => t.id === parentTaskId)?.title ?? "当前父任务")
    : undefined;

  // Single task with no children → use detailed ParsePreviewCard
  if (tasks.length === 1 && !tasks[0].children?.length && !tasks[0].parent_target_id && !tasks[0].parent_target_title) {
    return (
      <ParsePreviewCard
        parsed={tasks[0]}
        onConfirm={(task) => onConfirm([task])}
        onCancel={onCancel}
        spaceId={spaceId}
        parentTaskId={parentTaskId}
        parentTaskTitle={focusedParentTitle}
        traceId={traceId}
      />
    );
  }

  return (
    <MultiTaskList
      initialTasks={tasks}
      onConfirm={onConfirm}
      onCancel={onCancel}
      allTasks={allTasks}
      spaceId={spaceId}
      parentTaskId={parentTaskId}
      traceId={traceId}
    />
  );
}

// ─── Internal flat item representation ───────────────────────────────────────

type FlatItem = {
  task: Omit<ParsedTask, "children">;
  level: 0 | 1;
  parentLocalId: string | null;
  localId: string;
};

function toFlatItems(tasks: ParsedTask[], flatten = false): FlatItem[] {
  const items: FlatItem[] = [];
  tasks.forEach((task, pi) => {
    const parentLocalId = `p-${pi}`;
    const { children, ...rest } = task;
    items.push({ task: rest, level: 0, parentLocalId: null, localId: parentLocalId });
    children?.forEach((child, ci) => {
      items.push({
        task: child,
        level: flatten ? 0 : 1,
        parentLocalId: flatten ? null : parentLocalId,
        localId: `c-${pi}-${ci}`,
      });
    });
  });
  return items;
}

function formatDueDate(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("zh-CN", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ─── Multi-task list with hierarchy ──────────────────────────────────────────

function MultiTaskList({ initialTasks, onConfirm, onCancel, allTasks, spaceId, parentTaskId, traceId }: {
  initialTasks: ParsedTask[];
  onConfirm: (created: Task[]) => void;
  onCancel: () => void;
  allTasks: Task[];
  spaceId?: string;
  parentTaskId?: string;
  traceId?: string;
}) {
  // When parentTaskId is set, flatten all children to avoid exceeding max 2 levels
  const [flatItems, setFlatItems] = useState<FlatItem[]>(() =>
    toFlatItems(initialTasks, !!parentTaskId)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function removeItem(localId: string) {
    setFlatItems((prev) => {
      const item = prev.find((i) => i.localId === localId);
      // Removing a parent also removes its children
      if (item?.level === 0) {
        return prev.filter((i) => i.localId !== localId && i.parentLocalId !== localId);
      }
      return prev.filter((i) => i.localId !== localId);
    });
  }

  function updateTitle(localId: string, title: string) {
    setFlatItems((prev) => prev.map((i) => i.localId === localId ? { ...i, task: { ...i.task, title } } : i));
  }

  function getParentBadge(item: FlatItem): { label: string; unresolved: boolean; full: string } | null {
    if (item.level === 1) {
      const parentInBatch = flatItems.find((i) => i.localId === item.parentLocalId);
      const title = parentInBatch?.task.title || "同批父任务";
      return {
        label: `父:${shortTitle(title)}`,
        full: `父任务：${title}`,
        unresolved: false,
      };
    }

    if (parentTaskId) {
      const focusedParent = allTasks.find((t) => t.id === parentTaskId);
      const title = focusedParent?.title ?? "当前父任务";
      return {
        label: `父:${shortTitle(title)}`,
        full: `父任务：${title}`,
        unresolved: false,
      };
    }

    if (!item.task.parent_target_id && !item.task.parent_target_title) return null;
    const resolvedParent = resolveCreateParentTask(item.task, allTasks, parentTaskId);
    if (resolvedParent) {
      // 如果 parent 就是空间本身，不需要显示父任务标记
      if (spaceId && resolvedParent.id === spaceId) return null;
      const title = resolvedParent.title ?? item.task.parent_target_title ?? "已匹配父任务";
      return {
        label: `父:${shortTitle(title)}`,
        full: `父任务：${title}`,
        unresolved: false,
      };
    }

    const missing = item.task.parent_target_title ?? item.task.parent_target_id ?? "未知父任务";
    return {
      label: `父未匹配:${shortTitle(missing, 10)}`,
      full: `父任务未匹配：${missing}`,
      unresolved: true,
    };
  }

  async function confirm() {
    const active = flatItems.filter((i) => i.task.title.trim());
    if (active.length === 0) return;
    setLoading(true);
    setError("");
    const jsonHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(traceId ? { "x-ai-trace-id": traceId } : {}),
    };

    aiFlowLog("MultiTaskPreview.confirm.start", {
      trace_id: traceId ?? null,
      active_count: active.length,
      flat_items_count: flatItems.length,
      space_id: spaceId ?? null,
      parent_task_id: parentTaskId ?? null,
    });

    async function postTask(body: Record<string, unknown>): Promise<Task | null> {
      aiFlowLog("MultiTaskPreview.post-task", {
        trace_id: traceId ?? null,
        title: typeof body.title === "string" ? body.title : null,
        parent_id: typeof body.parent_id === "string" ? body.parent_id : null,
        space_id: typeof body.space_id === "string" ? body.space_id : null,
        assignee_email: typeof body.assignee_email === "string" ? body.assignee_email : null,
      });
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
      return res.ok ? (res.json() as Promise<Task>) : null;
    }

    try {
      const parentItems = active.filter((i) => i.level === 0);
      const childItems = active.filter((i) => i.level === 1);

      // Step 1: create all parent tasks in parallel
      const parentResults = await Promise.all(
        parentItems.map((item) => {
          const resolvedParent = resolveCreateParentTask(item.task, allTasks, parentTaskId);
          aiFlowLog("MultiTaskPreview.resolve-parent", {
            trace_id: traceId ?? null,
            local_id: item.localId,
            title: item.task.title,
            parent_target_id: item.task.parent_target_id ?? null,
            parent_target_title: item.task.parent_target_title ?? null,
            resolved_parent_id: resolvedParent?.id ?? null,
            resolved_parent_title: resolvedParent?.title ?? null,
            skipped: resolvedParent === null,
          });
          if (resolvedParent === null) return Promise.resolve(null);
          return postTask({
            ...item.task,
            ...(spaceId ? { space_id: spaceId } : {}),
            ...(item.task.assignee ? { assignee_email: item.task.assignee } : {}),
            ...(resolvedParent && resolvedParent.id !== spaceId ? { parent_id: resolvedParent.id } : {}),
          });
        })
      );

      // Build localId → created Task map
      const parentMap = new Map<string, Task | null>(
        parentItems.map((item, idx) => [item.localId, parentResults[idx]])
      );

      // Step 2: create all child tasks in parallel with parent_id
      const childResults = await Promise.all(
        childItems.map((item) => {
          const parent = parentMap.get(item.parentLocalId!);
          if (!parent) return Promise.resolve(null);
          aiFlowLog("MultiTaskPreview.child-parent-map", {
            trace_id: traceId ?? null,
            child_local_id: item.localId,
            child_title: item.task.title,
            parent_local_id: item.parentLocalId,
            mapped_parent_id: parent.id,
            mapped_parent_title: parent.title,
          });
          return postTask({
            ...item.task,
            parent_id: parent.id,
            ...(spaceId ? { space_id: spaceId } : {}),
            ...(item.task.assignee ? { assignee_email: item.task.assignee } : {}),
          });
        })
      );

      const created = [...parentResults, ...childResults].filter((t): t is Task => t !== null);
      aiFlowLog("MultiTaskPreview.confirm.done", {
        trace_id: traceId ?? null,
        created_count: created.length,
      });
      if (created.length === 0) {
        setError("创建失败，请重试");
        return;
      }
      onConfirm(created);
    } catch (err) {
      aiFlowLog("MultiTaskPreview.confirm.error", {
        trace_id: traceId ?? null,
        error: err instanceof Error ? err.message : String(err),
      });
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  const activeCount = flatItems.filter((i) => i.task.title.trim()).length;
  const unresolvedParentTargetCount = flatItems
    .filter((i) => i.level === 0 && i.task.title.trim())
    .filter((i) => !parentTaskId && !!(i.task.parent_target_id || i.task.parent_target_title) && !resolveCreateParentTask(i.task, allTasks, parentTaskId))
    .length;
  const executableCount = activeCount - unresolvedParentTargetCount;

  if (flatItems.length === 0) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-4 space-y-3">
          <p className="text-sm text-muted-foreground">已移除所有任务</p>
          <Button size="sm" variant="ghost" onClick={onCancel}>取消</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="pt-4 space-y-3">
        <p className="text-xs text-muted-foreground font-medium">
          解析出 {activeCount} 个任务 · 确认后批量创建
        </p>
        {unresolvedParentTargetCount > 0 && (
          <p className="text-xs text-destructive">
            {unresolvedParentTargetCount} 个任务父目标未匹配，执行时将自动跳过
          </p>
        )}

        <div className="space-y-2">
          {flatItems.map((item) => (
            (() => {
              const parentBadge = getParentBadge(item);
              return (
                <div
                  key={item.localId}
                  className={`space-y-1 group ${item.level === 1 ? "pl-5" : ""}`}
                >
                  {parentBadge && (
                    <div className="flex items-center">
                      <div
                        title={parentBadge.full}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 max-w-[260px] shadow-sm ${
                          parentBadge.unresolved
                            ? "border-destructive/50 bg-destructive/10 text-destructive"
                            : "border-primary/45 bg-primary/12 text-primary"
                        }`}
                      >
                        <span className="text-[10px] font-semibold tracking-wide">父任务</span>
                        <span className="text-xs font-semibold truncate">
                          {parentBadge.label.replace(/^父未匹配:|^父:/, "")}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    {item.level === 1 && (
                      <span className="text-xs text-muted-foreground flex-shrink-0">↳</span>
                    )}
                    <Badge
                      variant="outline"
                      className={`text-xs flex-shrink-0 ${PRIORITY_COLORS[item.task.priority ?? 2]}`}
                    >
                      {PRIORITY_LABELS[item.task.priority ?? 2]}
                    </Badge>
                    <Input
                      value={item.task.title}
                      onChange={(e) => updateTitle(item.localId, e.target.value)}
                      className="h-7 text-sm flex-1 min-w-0"
                    />
                    {item.task.due_date && (
                      <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:block">
                        {formatDueDate(item.task.due_date)}
                      </span>
                    )}
                    {item.task.assignee && (
                      <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:block">
                        @{item.task.assignee.split("@")[0]}
                      </span>
                    )}
                    <button
                      className="text-muted-foreground hover:text-destructive text-sm flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeItem(item.localId)}
                      title="移除此任务"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })()
          ))}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={confirm} disabled={loading || executableCount === 0}>
            {loading ? "创建中..." : `确认创建 ${executableCount} 个任务`}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>取消</Button>
        </div>
      </CardContent>
    </Card>
  );
}
