"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MultiTaskPreview } from "@/components/MultiTaskPreview";
import type { ParsedAction, Task, ActionResult, SpaceMember } from "@/lib/types";

interface Props {
  actions: ParsedAction[];
  raw: string;
  allTasks: Task[];
  spaceId?: string;
  members?: SpaceMember[];
  onDone: (result: ActionResult) => void;
  onCancel: () => void;
}

const PRIORITY_LABELS: Record<number, string> = { 0: "P0紧急", 1: "P1高", 2: "P2普通", 3: "P3低" };

function resolveTask(action: ParsedAction, allTasks: Task[]): Task | null {
  if (action.target_id) {
    const exact = allTasks.find((t) => t.id === action.target_id);
    if (exact) return exact;
  }
  if (action.target_title) {
    const q = action.target_title.toLowerCase();
    return allTasks.find(
      (t) => t.title.toLowerCase().includes(q) || q.includes(t.title.toLowerCase())
    ) ?? null;
  }
  return null;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function ActionRow({ action, allTasks }: { action: ParsedAction; allTasks: Task[] }) {
  const task = action.type !== "create" ? resolveTask(action, allTasks) : null;
  const notFound = action.type !== "create" && !task;
  const displayTitle = task?.title ?? action.target_title ?? "未知任务";

  if (action.type === "create") {
    const count = action.tasks?.length ?? 0;
    const first = action.tasks?.[0];
    return (
      <div className="flex items-start gap-2 text-sm">
        <span className="text-sage flex-shrink-0">＋</span>
        <span>
          {count === 1 && first
            ? <>新建「<span className="font-medium">{first.title}</span>」{first.priority !== undefined && first.priority !== 2 ? ` · ${PRIORITY_LABELS[first.priority]}` : ""}{first.due_date ? ` · ${formatDate(first.due_date)}截止` : ""}</>
            : <>新建 {count} 个任务</>
          }
        </span>
      </div>
    );
  }

  if (action.type === "complete") {
    return (
      <div className={`flex items-start gap-2 text-sm ${notFound ? "text-destructive" : ""}`}>
        <span className="flex-shrink-0">✓</span>
        <span>
          完成「<span className="font-medium">{displayTitle}</span>」
          {notFound && <span className="text-xs ml-1 text-destructive">（未找到匹配任务）</span>}
        </span>
      </div>
    );
  }

  if (action.type === "delete") {
    return (
      <div className={`flex items-start gap-2 text-sm ${notFound ? "text-destructive" : ""}`}>
        <span className="flex-shrink-0 text-destructive">×</span>
        <span>
          删除「<span className="font-medium">{displayTitle}</span>」
          {notFound && <span className="text-xs ml-1 text-destructive">（未找到匹配任务）</span>}
        </span>
      </div>
    );
  }

  if (action.type === "update" && action.changes) {
    const c = action.changes;
    const changeParts: string[] = [];
    if (c.priority !== undefined) changeParts.push(`优先级→${PRIORITY_LABELS[c.priority]}`);
    if (c.due_date !== undefined) changeParts.push(`截止→${formatDate(c.due_date)}`);
    if (c.start_date !== undefined) changeParts.push(`开始→${formatDate(c.start_date)}`);
    if (c.end_date !== undefined) changeParts.push(`结束→${formatDate(c.end_date)}`);
    if (c.title !== undefined) changeParts.push(`标题→「${c.title}」`);
    if (c.description !== undefined) changeParts.push("更新描述");
    if (c.tags !== undefined) changeParts.push(`标签→[${c.tags.join(",")}]`);
    return (
      <div className={`flex items-start gap-2 text-sm ${notFound ? "text-destructive" : ""}`}>
        <span className="flex-shrink-0 text-info">↻</span>
        <span>
          更新「<span className="font-medium">{displayTitle}</span>」：{changeParts.join("、") || "无变更"}
          {notFound && <span className="text-xs ml-1 text-destructive">（未找到匹配任务）</span>}
        </span>
      </div>
    );
  }

  if (action.type === "add_log") {
    return (
      <div className={`flex items-start gap-2 text-sm ${notFound ? "text-destructive" : ""}`}>
        <span className="flex-shrink-0 text-muted-foreground">💬</span>
        <span>
          「<span className="font-medium">{displayTitle}</span>」添加进展：
          <span className="text-muted-foreground">「{action.log_content}」</span>
          {notFound && <span className="text-xs ml-1 text-destructive">（未找到匹配任务）</span>}
        </span>
      </div>
    );
  }

  return null;
}

export function ActionPreview({ actions, raw, allTasks, spaceId, members, onDone, onCancel }: Props) {
  const [executing, setExecuting] = useState(false);

  // 如果全是 create actions，委托给 MultiTaskPreview
  const createActions = actions.filter((a) => a.type === "create");
  const nonCreateActions = actions.filter((a) => a.type !== "create");

  if (nonCreateActions.length === 0 && createActions.length > 0) {
    const allParsedTasks = createActions.flatMap((a) => a.tasks ?? []);
    return (
      <MultiTaskPreview
        tasks={allParsedTasks}
        raw={raw}
        onConfirm={(created) => onDone({ created })}
        onCancel={onCancel}
        spaceId={spaceId}
      />
    );
  }

  async function handleConfirm() {
    setExecuting(true);
    const result: ActionResult = {};

    for (const action of actions) {
      try {
        if (action.type === "create") {
          const allParsedTasks = action.tasks ?? [];
          // 创建父任务（无 parent_id 的）
          const parents = allParsedTasks.filter((t) => !("_parentLocalId" in t));
          const created: Task[] = [];

          const parentResults = await Promise.all(
            parents.map((t) =>
              fetch("/api/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...t, space_id: spaceId ?? undefined, assignee_email: t.assignee }),
              }).then((r) => r.ok ? r.json() as Promise<Task> : null)
            )
          );

          for (let i = 0; i < parents.length; i++) {
            const parentTask = parentResults[i];
            if (!parentTask) continue;
            created.push(parentTask);
            const children = parents[i].children ?? [];
            const childResults = await Promise.all(
              children.map((c) =>
                fetch("/api/tasks", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ...c, space_id: spaceId ?? undefined, parent_id: parentTask.id }),
                }).then((r) => r.ok ? r.json() as Promise<Task> : null)
              )
            );
            for (const child of childResults) {
              if (child) created.push(child);
            }
          }

          result.created = [...(result.created ?? []), ...created];
          continue;
        }

        const task = resolveTask(action, allTasks);
        if (!task) continue;

        if (action.type === "update") {
          const res = await fetch(`/api/tasks/${task.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(action.changes),
          });
          if (res.ok) result.updated = [...(result.updated ?? []), await res.json() as Task];
        }

        if (action.type === "complete") {
          const res = await fetch(`/api/tasks/${task.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ complete: true }),
          });
          if (res.ok) result.completed = [...(result.completed ?? []), task.id];
        }

        if (action.type === "delete") {
          const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
          if (res.ok) result.deleted = [...(result.deleted ?? []), task.id];
        }

        if (action.type === "add_log" && action.log_content) {
          await fetch(`/api/tasks/${task.id}/logs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: action.log_content }),
          });
          result.logged = [...(result.logged ?? []), { taskId: task.id }];
        }
      } catch {
        // 单个 action 失败不中断其他操作
      }
    }

    setExecuting(false);
    onDone(result);
  }

  const hasUnresolvable = nonCreateActions.some((a) => !resolveTask(a, allTasks));
  const executableCount = actions.reduce((n, a) => {
    if (a.type === "create") return n + (a.tasks?.length ?? 0);
    return resolveTask(a, allTasks) ? n + 1 : n;
  }, 0);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          AI 理解：{actions.length} 项操作
        </p>
        {hasUnresolvable && (
          <span className="text-xs text-destructive">部分任务未找到</span>
        )}
      </div>

      <div className="space-y-2 py-1">
        {actions.map((action, i) => (
          <ActionRow key={i} action={action} allTasks={allTasks} />
        ))}
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={executing}>
          取消
        </Button>
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={executing || executableCount === 0}
        >
          {executing ? "执行中..." : `全部执行${executableCount > 0 ? ` (${executableCount})` : ""}`}
        </Button>
      </div>
    </div>
  );
}
