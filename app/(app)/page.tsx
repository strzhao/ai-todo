"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { NLInput } from "@/components/NLInput";
import { ActionPreview } from "@/components/ActionPreview";
import { TaskList } from "@/components/TaskList";
import { Button } from "@/components/ui/button";
import type { ParsedAction, Task, ActionResult } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Collect all descendant IDs recursively from a flat task list */
function collectDescendantIds(tasks: Task[], parentId: string): Set<string> {
  const ids = new Set<string>();
  const stack = [parentId];
  while (stack.length) {
    const pid = stack.pop()!;
    for (const t of tasks) {
      if (t.parent_id === pid && !ids.has(t.id)) {
        ids.add(t.id);
        stack.push(t.id);
      }
    }
  }
  return ids;
}

function isDueToday(iso?: string) {
  if (!iso) return false;
  const dueAt = new Date(iso).getTime();
  if (Number.isNaN(dueAt)) return false;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const start = todayStart.getTime();
  return dueAt >= start && dueAt < start + DAY_MS;
}

function sortTasksWithTodayFirst(items: Task[]) {
  return [...items].sort((a, b) => {
    const aToday = isDueToday(a.due_date);
    const bToday = isDueToday(b.due_date);
    if (aToday !== bToday) return aToday ? -1 : 1;

    if (a.priority !== b.priority) return a.priority - b.priority;

    if (aToday && bToday && a.due_date && b.due_date) {
      const dueDiff = new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      if (dueDiff !== 0) return dueDiff;
    }

    const createdDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (createdDiff !== 0) return createdDiff;
    return a.id.localeCompare(b.id);
  });
}

export default function TaskHomePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [inputText, setInputText] = useState("");
  const [preview, setPreview] = useState<{ actions: ParsedAction[]; raw: string; traceId?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const focusedTaskId = searchParams.get("focus");

  useEffect(() => {
    Promise.all([
      fetch("/api/tasks").then((r) => r.json()).catch(() => []),
      fetch("/api/tasks?filter=completed").then((r) => r.json()).catch(() => []),
    ]).then(([active, completed]: [Task[], Task[]]) => {
      setTasks(Array.isArray(active) ? sortTasksWithTodayFirst(active) : []);
      setCompletedTasks(Array.isArray(completed) ? completed.filter((t) => t.status === 2) : []);
    }).finally(() => setLoading(false));
  }, []);

  // Scroll to and highlight focused task from ?focus=taskId
  useEffect(() => {
    if (!focusedTaskId || loading) return;
    const el = document.getElementById(`task-${focusedTaskId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-sage/40", "bg-sage-mist", "rounded-md");
      const timer = setTimeout(() => {
        el.classList.remove("ring-2", "ring-sage/40", "bg-sage-mist", "rounded-md");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [focusedTaskId, loading]);

  const todayCount = useMemo(
    () => tasks.filter((t) => isDueToday(t.due_date)).length,
    [tasks]
  );

  function handleActionDone(result: ActionResult) {
    if (result.created?.length) setTasks((prev) => sortTasksWithTodayFirst([...result.created!, ...prev]));
    if (result.updated?.length) setTasks((prev) => sortTasksWithTodayFirst(prev.map((t) => result.updated!.find((u) => u.id === t.id) ?? t)));
    if (result.completed?.length) {
      for (const id of result.completed) {
        const done = tasks.find((t) => t.id === id);
        const descendantIds = collectDescendantIds(tasks, id);
        setTasks((prev) => sortTasksWithTodayFirst(prev.filter((t) => t.id !== id && !descendantIds.has(t.id))));
        if (done) setCompletedTasks((prev) => [{ ...done, status: 2 as const }, ...prev].slice(0, 20));
      }
    }
    if (result.deleted?.length) {
      setTasks((prev) => {
        const allDeletedIds = new Set(result.deleted!);
        for (const id of result.deleted!) {
          for (const did of collectDescendantIds(prev, id)) allDeletedIds.add(did);
        }
        return sortTasksWithTodayFirst(prev.filter((t) => !allDeletedIds.has(t.id)));
      });
    }
    const hasSuccess = Boolean(
      result.created?.length ||
      result.updated?.length ||
      result.completed?.length ||
      result.deleted?.length ||
      result.logged?.length
    );
    if (hasSuccess) {
      setInputText("");
      window.dispatchEvent(new Event("tasks-changed"));
    }
    setPreview(null);
  }

  function handleComplete(id: string) {
    const completed = tasks.find((t) => t.id === id);
    const descendantIds = collectDescendantIds(tasks, id);
    setTasks((prev) => sortTasksWithTodayFirst(prev.filter((t) => t.id !== id && !descendantIds.has(t.id))));
    if (completed) setCompletedTasks((prev) => [{ ...completed, status: 2 as const }, ...prev].slice(0, 20));
    window.dispatchEvent(new Event("tasks-changed"));
  }

  function handleDelete(id: string) {
    const descendantIds = collectDescendantIds(tasks, id);
    setTasks((prev) => sortTasksWithTodayFirst(prev.filter((t) => t.id !== id && !descendantIds.has(t.id))));
    window.dispatchEvent(new Event("tasks-changed"));
  }

  function handleReopen(id: string) {
    const reopened = completedTasks.find((t) => t.id === id);
    setCompletedTasks((prev) => prev.filter((t) => t.id !== id));
    if (reopened) setTasks((prev) => sortTasksWithTodayFirst([...prev, { ...reopened, status: 0 as const, completed_at: undefined }]));
    window.dispatchEvent(new Event("tasks-changed"));
  }

  function handleUpdate(id: string, updates: Partial<Task>) {
    setTasks((prev) => sortTasksWithTodayFirst(prev.map((t) => t.id === id ? { ...t, ...updates } : t)));
  }

  return (
    <div className="app-content">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">全部任务</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
            <span>{tasks.length} 个待办</span>
            <span className="today-count-chip">今日 {todayCount}</span>
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/readme">使用文档</Link>
        </Button>
      </div>

      <div className="mb-4">
        <NLInput
          onResult={(actions, r, traceId) => setPreview({ actions, raw: r, traceId })}
          tasks={tasks}
          value={inputText}
          onValueChange={setInputText}
        />
      </div>

      {preview && (
        <div className="mb-4">
          <ActionPreview
            actions={preview.actions}
            raw={preview.raw}
            allTasks={tasks}
            traceId={preview.traceId}
            onDone={handleActionDone}
            onCancel={() => setPreview(null)}
          />
        </div>
      )}

      <TaskList
        tasks={tasks}
        completedTasks={completedTasks}
        loading={loading}
        onComplete={handleComplete}
        onDelete={handleDelete}
        onUpdate={handleUpdate}
        onReopen={handleReopen}
        emptyText="还没有任务"
        emptySubtext="试着输入一句话"
        highlightTodayDue
        groupPinnedAtBottom
        pinnedSectionDefaultCollapsed
        pinnedSectionTitle="置顶任务"
      />
    </div>
  );
}
