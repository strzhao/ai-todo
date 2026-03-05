"use client";

import { useEffect, useMemo, useState } from "react";
import { NLInput } from "@/components/NLInput";
import { ActionPreview } from "@/components/ActionPreview";
import { TaskList } from "@/components/TaskList";
import type { ParsedAction, Task, ActionResult } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

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
  const [preview, setPreview] = useState<{ actions: ParsedAction[]; raw: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/tasks").then((r) => r.json()).catch(() => []),
      fetch("/api/tasks?filter=completed").then((r) => r.json()).catch(() => []),
    ]).then(([active, completed]: [Task[], Task[]]) => {
      setTasks(Array.isArray(active) ? sortTasksWithTodayFirst(active) : []);
      setCompletedTasks(Array.isArray(completed) ? completed.filter((t) => t.status === 2) : []);
    }).finally(() => setLoading(false));
  }, []);

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
        setTasks((prev) => sortTasksWithTodayFirst(prev.filter((t) => t.id !== id && t.parent_id !== id)));
        if (done) setCompletedTasks((prev) => [{ ...done, status: 2 as const }, ...prev].slice(0, 20));
      }
    }
    if (result.deleted?.length) {
      setTasks((prev) => sortTasksWithTodayFirst(prev.filter((t) => !result.deleted!.includes(t.id) && !result.deleted!.includes(t.parent_id ?? ""))));
    }
    setPreview(null);
  }

  function handleComplete(id: string) {
    const completed = tasks.find((t) => t.id === id);
    setTasks((prev) => sortTasksWithTodayFirst(prev.filter((t) => t.id !== id && t.parent_id !== id)));
    if (completed) setCompletedTasks((prev) => [{ ...completed, status: 2 as const }, ...prev].slice(0, 20));
  }

  function handleDelete(id: string) {
    setTasks((prev) => sortTasksWithTodayFirst(prev.filter((t) => t.id !== id && t.parent_id !== id)));
  }

  function handleUpdate(id: string, updates: Partial<Task>) {
    setTasks((prev) => sortTasksWithTodayFirst(prev.map((t) => t.id === id ? { ...t, ...updates } : t)));
  }

  return (
    <div className="app-content">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">全部任务</h1>
        <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
          <span>{tasks.length} 个待办</span>
          <span className="today-count-chip">今日 {todayCount}</span>
        </p>
      </div>

      <div className="mb-4">
        <NLInput
          onResult={(actions, r) => setPreview({ actions, raw: r })}
          tasks={tasks}
        />
      </div>

      {preview && (
        <div className="mb-4">
          <ActionPreview
            actions={preview.actions}
            raw={preview.raw}
            allTasks={tasks}
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
        emptyText="还没有任务"
        emptySubtext="试着输入一句话"
        highlightTodayDue
      />
    </div>
  );
}
