"use client";

import { useState } from "react";
import { ParsePreviewCard } from "@/components/ParsePreviewCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  spaceId?: string;
  parentTaskId?: string;
}

export function MultiTaskPreview({ tasks, raw, onConfirm, onCancel, spaceId, parentTaskId }: Props) {
  // Single task with no children → use detailed ParsePreviewCard
  if (tasks.length === 1 && !tasks[0].children?.length) {
    return (
      <ParsePreviewCard
        parsed={tasks[0]}
        onConfirm={(task) => onConfirm([task])}
        onCancel={onCancel}
        spaceId={spaceId}
        parentTaskId={parentTaskId}
      />
    );
  }

  return (
    <MultiTaskList
      initialTasks={tasks}
      onConfirm={onConfirm}
      onCancel={onCancel}
      spaceId={spaceId}
      parentTaskId={parentTaskId}
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

function MultiTaskList({ initialTasks, onConfirm, onCancel, spaceId, parentTaskId }: {
  initialTasks: ParsedTask[];
  onConfirm: (created: Task[]) => void;
  onCancel: () => void;
  spaceId?: string;
  parentTaskId?: string;
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

  async function confirm() {
    const active = flatItems.filter((i) => i.task.title.trim());
    if (active.length === 0) return;
    setLoading(true);
    setError("");

    async function postTask(body: Record<string, unknown>): Promise<Task | null> {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.ok ? (res.json() as Promise<Task>) : null;
    }

    try {
      const parentItems = active.filter((i) => i.level === 0);
      const childItems = active.filter((i) => i.level === 1);

      // Step 1: create all parent tasks in parallel
      const parentResults = await Promise.all(
        parentItems.map((item) =>
          postTask({
            ...item.task,
            ...(spaceId ? { space_id: spaceId } : {}),
            ...(item.task.assignee ? { assignee_email: item.task.assignee } : {}),
            ...(parentTaskId ? { parent_id: parentTaskId } : {}),
          })
        )
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
          return postTask({
            ...item.task,
            parent_id: parent.id,
            ...(spaceId ? { space_id: spaceId } : {}),
            ...(item.task.assignee ? { assignee_email: item.task.assignee } : {}),
          });
        })
      );

      const created = [...parentResults, ...childResults].filter((t): t is Task => t !== null);
      if (created.length === 0) {
        setError("创建失败，请重试");
        return;
      }
      onConfirm(created);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  const activeCount = flatItems.filter((i) => i.task.title.trim()).length;

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

        <div className="space-y-1.5">
          {flatItems.map((item) => (
            <div
              key={item.localId}
              className={`flex items-center gap-2 group ${item.level === 1 ? "pl-5" : ""}`}
            >
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
          ))}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={confirm} disabled={loading || activeCount === 0}>
            {loading ? "创建中..." : `确认创建 ${activeCount} 个任务`}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>取消</Button>
        </div>
      </CardContent>
    </Card>
  );
}
