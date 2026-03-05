"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MultiTaskPreview } from "@/components/MultiTaskPreview";
import { aiFlowLog, summarizeParsedActions } from "@/lib/ai-flow-log";
import type { ParsedAction, ParsedTask, Task, ActionResult, SpaceMember } from "@/lib/types";

interface Props {
  actions: ParsedAction[];
  raw: string;
  allTasks: Task[];
  spaceId?: string;
  members?: SpaceMember[];
  parentTaskId?: string;
  traceId?: string;
  onDone: (result: ActionResult) => void;
  onCancel: () => void;
}

const PRIORITY_LABELS: Record<number, string> = { 0: "P0紧急", 1: "P1高", 2: "P2普通", 3: "P3低" };

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

function resolveTask(action: ParsedAction, allTasks: Task[]): Task | null {
  return resolveTaskByTarget(allTasks, action.target_id, action.target_title);
}

function resolveParentTask(action: ParsedAction, allTasks: Task[]): Task | null {
  return resolveTaskByTarget(allTasks, action.to_parent_id, action.to_parent_title);
}

function resolveCreateParentTask(parsed: ParsedTask, allTasks: Task[], parentTaskId?: string): Task | null | undefined {
  if (parentTaskId) return { id: parentTaskId } as Task;
  if (!parsed.parent_target_id && !parsed.parent_target_title) return undefined;
  return resolveTaskByTarget(allTasks, parsed.parent_target_id, parsed.parent_target_title);
}

function getCreateParentDisplay(parsed: ParsedTask, allTasks: Task[], parentTaskId?: string): { status: "matched" | "unresolved"; title: string } | null {
  if (parentTaskId) {
    const focusedParent = allTasks.find((t) => t.id === parentTaskId);
    return { status: "matched", title: focusedParent?.title ?? "当前父任务" };
  }

  if (!parsed.parent_target_id && !parsed.parent_target_title) return null;

  const resolved = resolveCreateParentTask(parsed, allTasks, parentTaskId);
  if (resolved) {
    return {
      status: "matched",
      title: resolved.title ?? parsed.parent_target_title ?? "已匹配父任务",
    };
  }

  return {
    status: "unresolved",
    title: parsed.parent_target_title ?? parsed.parent_target_id ?? "未知父任务",
  };
}

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function ActionRow({ action, allTasks, parentTaskId }: { action: ParsedAction; allTasks: Task[]; parentTaskId?: string }) {
  const task = action.type !== "create" ? resolveTask(action, allTasks) : null;
  const parentTask = action.type === "move" ? resolveParentTask(action, allTasks) : null;
  const notFound = (action.type !== "create" && !task) || (action.type === "move" && !parentTask);
  const displayTitle = task?.title ?? action.target_title ?? "未知任务";
  const parentDisplayTitle = parentTask?.title ?? action.to_parent_title ?? "未知父任务";

  if (action.type === "create") {
    const count = action.tasks?.length ?? 0;
    const first = action.tasks?.[0];
    const parentInfo = first ? getCreateParentDisplay(first, allTasks, parentTaskId) : null;
    const parentInfos = (action.tasks ?? [])
      .map((t) => getCreateParentDisplay(t, allTasks, parentTaskId))
      .filter((i): i is { status: "matched" | "unresolved"; title: string } => Boolean(i));
    const unresolvedCount = parentInfos.filter((i) => i.status === "unresolved").length;
    const matchedCount = parentInfos.filter((i) => i.status === "matched").length;
    return (
      <div className="flex items-start gap-2 text-sm">
        <span className="text-sage flex-shrink-0">＋</span>
        <span>
          {count === 1 && first
            ? (
              <>
                新建「<span className="font-medium">{first.title}</span>」
                {parentInfo?.status === "matched" && <>，在「<span className="font-medium">{parentInfo.title}</span>」下</>}
                {first.priority !== undefined && first.priority !== 2 ? ` · ${PRIORITY_LABELS[first.priority]}` : ""}
                {first.due_date ? ` · ${formatDate(first.due_date)}截止` : ""}
                {parentInfo?.status === "unresolved" && <span className="text-xs ml-1 text-destructive">（父任务未匹配：{parentInfo.title}）</span>}
              </>
            )
            : (
              <>
                新建 {count} 个任务
                {matchedCount > 0 && <span className="text-xs text-muted-foreground ml-1">（{matchedCount} 个已匹配父任务）</span>}
                {unresolvedCount > 0 && <span className="text-xs ml-1 text-destructive">（{unresolvedCount} 个父任务未匹配）</span>}
              </>
            )
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
    if (c.assignee_email !== undefined) changeParts.push(c.assignee_email ? `经办人→${c.assignee_email}` : "经办人→未指派");
    if (c.progress !== undefined) changeParts.push(`进度→${c.progress}%`);
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

  if (action.type === "move") {
    const invalidSame = task && parentTask && task.id === parentTask.id;
    return (
      <div className={`flex items-start gap-2 text-sm ${(notFound || invalidSame) ? "text-destructive" : ""}`}>
        <span className="flex-shrink-0 text-info">↳</span>
        <span>
          移动「<span className="font-medium">{displayTitle}</span>」到「<span className="font-medium">{parentDisplayTitle}</span>」下
          {notFound && <span className="text-xs ml-1 text-destructive">（未找到匹配任务）</span>}
          {invalidSame && <span className="text-xs ml-1 text-destructive">（目标父任务不能是自身）</span>}
        </span>
      </div>
    );
  }

  return null;
}

export function ActionPreview({ actions, raw, allTasks, spaceId, members, parentTaskId, traceId, onDone, onCancel }: Props) {
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
        allTasks={allTasks}
        spaceId={spaceId}
        parentTaskId={parentTaskId}
        traceId={traceId}
      />
    );
  }

  async function handleConfirm() {
    setExecuting(true);
    const result: ActionResult = {};
    const jsonHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(traceId ? { "x-ai-trace-id": traceId } : {}),
    };
    const traceHeaders: Record<string, string> = traceId ? { "x-ai-trace-id": traceId } : {};

    aiFlowLog("ActionPreview.confirm.start", {
      trace_id: traceId ?? null,
      actions_count: actions.length,
      actions: summarizeParsedActions(actions),
      all_tasks_count: allTasks.length,
      space_id: spaceId ?? null,
      parent_task_id: parentTaskId ?? null,
      members_count: members?.length ?? 0,
    });

    for (const action of actions) {
      try {
        if (action.type === "create") {
          const allParsedTasks = action.tasks ?? [];
          // 创建父任务（无 parent_id 的）
          const parents = allParsedTasks.filter((t) => !("_parentLocalId" in t));
          const created: Task[] = [];

          const parentResults = await Promise.all(
            parents.map((t) => {
              const resolvedParent = resolveCreateParentTask(t, allTasks, parentTaskId);
              aiFlowLog("ActionPreview.create.parent-resolve", {
                trace_id: traceId ?? null,
                title: t.title,
                parent_target_id: t.parent_target_id ?? null,
                parent_target_title: t.parent_target_title ?? null,
                resolved_parent_id: resolvedParent?.id ?? null,
                resolved_parent_title: resolvedParent?.title ?? null,
                skipped: resolvedParent === null,
              });
              if (resolvedParent === null) return Promise.resolve(null);

              const body = {
                ...t,
                space_id: spaceId ?? undefined,
                assignee_email: t.assignee,
                ...(resolvedParent ? { parent_id: resolvedParent.id } : {}),
              };
              aiFlowLog("ActionPreview.create.parent-post", {
                trace_id: traceId ?? null,
                title: body.title,
                parent_id: body.parent_id ?? null,
                space_id: body.space_id ?? null,
                assignee_email: body.assignee_email ?? null,
              });

              return fetch("/api/tasks", {
                method: "POST",
                headers: jsonHeaders,
                body: JSON.stringify(body),
              }).then((r) => r.ok ? r.json() as Promise<Task> : null);
            })
          );

          for (let i = 0; i < parents.length; i++) {
            const createdParent = parentResults[i];
            if (!createdParent) continue;
            created.push(createdParent);
            const children = parents[i].children ?? [];
            const childResults = await Promise.all(
              children.map((c) => {
                const body = { ...c, space_id: spaceId ?? undefined, parent_id: createdParent.id };
                aiFlowLog("ActionPreview.create.child-post", {
                  trace_id: traceId ?? null,
                  title: body.title,
                  parent_id: body.parent_id,
                  space_id: body.space_id ?? null,
                  assignee_email: c.assignee ?? null,
                });
                return fetch("/api/tasks", {
                  method: "POST",
                  headers: jsonHeaders,
                  body: JSON.stringify(body),
                }).then((r) => r.ok ? r.json() as Promise<Task> : null)
              })
            );
            for (const child of childResults) {
              if (child) created.push(child);
            }
          }

          aiFlowLog("ActionPreview.create.done", {
            trace_id: traceId ?? null,
            created_count: created.length,
          });
          result.created = [...(result.created ?? []), ...created];
          continue;
        }

        const task = resolveTask(action, allTasks);
        aiFlowLog("ActionPreview.action.resolve-target", {
          trace_id: traceId ?? null,
          action_type: action.type,
          target_id: action.target_id ?? null,
          target_title: action.target_title ?? null,
          resolved_task_id: task?.id ?? null,
          resolved_task_title: task?.title ?? null,
        });
        if (!task) continue;

        if (action.type === "update") {
          aiFlowLog("ActionPreview.update.request", {
            trace_id: traceId ?? null,
            task_id: task.id,
            changes: action.changes ?? {},
          });
          const res = await fetch(`/api/tasks/${task.id}`, {
            method: "PATCH",
            headers: jsonHeaders,
            body: JSON.stringify(action.changes),
          });
          if (res.ok) result.updated = [...(result.updated ?? []), await res.json() as Task];
        }

        if (action.type === "move") {
          const parentTask = resolveParentTask(action, allTasks);
          aiFlowLog("ActionPreview.move.resolve-parent", {
            trace_id: traceId ?? null,
            task_id: task.id,
            to_parent_id: action.to_parent_id ?? null,
            to_parent_title: action.to_parent_title ?? null,
            resolved_parent_id: parentTask?.id ?? null,
            resolved_parent_title: parentTask?.title ?? null,
            skipped: !parentTask || parentTask.id === task.id,
          });
          if (!parentTask || parentTask.id === task.id) continue;
          const res = await fetch(`/api/tasks/${task.id}`, {
            method: "PATCH",
            headers: jsonHeaders,
            body: JSON.stringify({ parent_id: parentTask.id }),
          });
          if (res.ok) result.updated = [...(result.updated ?? []), await res.json() as Task];
        }

        if (action.type === "complete") {
          const res = await fetch(`/api/tasks/${task.id}`, {
            method: "PATCH",
            headers: jsonHeaders,
            body: JSON.stringify({ complete: true }),
          });
          if (res.ok) result.completed = [...(result.completed ?? []), task.id];
        }

        if (action.type === "delete") {
          const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE", headers: traceHeaders });
          if (res.ok) result.deleted = [...(result.deleted ?? []), task.id];
        }

        if (action.type === "add_log" && action.log_content) {
          aiFlowLog("ActionPreview.add-log.request", {
            trace_id: traceId ?? null,
            task_id: task.id,
            has_content: true,
          });
          await fetch(`/api/tasks/${task.id}/logs`, {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({ content: action.log_content }),
          });
          result.logged = [...(result.logged ?? []), { taskId: task.id }];
        }
      } catch (err) {
        aiFlowLog("ActionPreview.action.error", {
          trace_id: traceId ?? null,
          action_type: action.type,
          error: err instanceof Error ? err.message : String(err),
        });
        // 单个 action 失败不中断其他操作
      }
    }

    setExecuting(false);
    aiFlowLog("ActionPreview.confirm.done", {
      trace_id: traceId ?? null,
      created_count: result.created?.length ?? 0,
      updated_count: result.updated?.length ?? 0,
      completed_count: result.completed?.length ?? 0,
      deleted_count: result.deleted?.length ?? 0,
      logged_count: result.logged?.length ?? 0,
    });
    onDone(result);
  }

  const hasUnresolvable = nonCreateActions.some((a) => {
    const task = resolveTask(a, allTasks);
    if (!task) return true;
    if (a.type !== "move") return false;
    const parentTask = resolveParentTask(a, allTasks);
    return !parentTask || parentTask.id === task.id;
  }) || createActions.some((a) =>
    (a.tasks ?? []).some((t) =>
      !parentTaskId && !!(t.parent_target_id || t.parent_target_title) && !resolveCreateParentTask(t, allTasks, parentTaskId)
    )
  );
  const executableCount = actions.reduce((n, a) => {
    if (a.type === "create") {
      const creatable = (a.tasks ?? []).filter((t) => resolveCreateParentTask(t, allTasks, parentTaskId) !== null).length;
      return n + creatable;
    }
    const task = resolveTask(a, allTasks);
    if (!task) return n;
    if (a.type !== "move") return n + 1;
    const parentTask = resolveParentTask(a, allTasks);
    if (!parentTask || parentTask.id === task.id) return n;
    return n + 1;
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
          <ActionRow key={i} action={action} allTasks={allTasks} parentTaskId={parentTaskId} />
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
