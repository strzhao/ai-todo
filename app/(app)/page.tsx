"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { NLInput } from "@/components/NLInput";
import { ActionPreview } from "@/components/ActionPreview";
import { PersonalDailySummary } from "@/components/PersonalDailySummary";
import { TaskList } from "@/components/TaskList";
import { Button } from "@/components/ui/button";
import { useTasks, useCompletedTasks, mutateTasks } from "@/lib/use-tasks";
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
  // --- All hooks at the top, before any conditional returns ---
  const { data: rawTasks, isLoading: tasksLoading, mutate: mutateCurrent } = useTasks();
  const { data: rawCompleted, isLoading: completedLoading, mutate: mutateCompleted, hasMore: hasMoreCompleted, loadMore: loadMoreCompleted, isLoadingMore: isLoadingMoreCompleted } = useCompletedTasks();
  const [inputText, setInputText] = useState("");
  const [preview, setPreview] = useState<{ actions: ParsedAction[]; raw: string; traceId?: string } | null>(null);
  const searchParams = useSearchParams();
  const focusedTaskId = searchParams.get("focus");

  const tasks = useMemo(() => rawTasks ? sortTasksWithTodayFirst(rawTasks) : [], [rawTasks]);
  const completedTasks = useMemo(
    () => rawCompleted ? rawCompleted.filter((t) => t.status === 2) : [],
    [rawCompleted]
  );
  const loading = tasksLoading || completedLoading;

  const todayCount = useMemo(
    () => tasks.filter((t) => isDueToday(t.due_date)).length,
    [tasks]
  );

  // Listen for tasks-changed events from non-SWR components to trigger revalidation
  useEffect(() => {
    const handler = () => mutateTasks();
    window.addEventListener("tasks-changed", handler);
    return () => window.removeEventListener("tasks-changed", handler);
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

  function handleActionDone(result: ActionResult) {
    const hasSuccess = Boolean(
      result.created?.length ||
      result.updated?.length ||
      result.completed?.length ||
      result.deleted?.length ||
      result.logged?.length
    );
    if (hasSuccess) {
      setInputText("");
      mutateTasks();
      window.dispatchEvent(new Event("tasks-changed"));
    }
    setPreview(null);
  }

  function handleComplete(id: string) {
    // Optimistic update: remove from active, add to completed
    const done = rawTasks?.find((t) => t.id === id);
    const descendantIds = collectDescendantIds(rawTasks ?? [], id);
    mutateCurrent(
      (prev) => prev?.filter((t) => t.id !== id && !descendantIds.has(t.id)),
      { revalidate: true }
    );
    if (done) {
      mutateCompleted(
        (prev) => [{ ...done, status: 2 as const }, ...(prev ?? [])].slice(0, 20),
        { revalidate: true }
      );
    }
    window.dispatchEvent(new Event("tasks-changed"));
  }

  function handleDelete(id: string) {
    const descendantIds = collectDescendantIds(rawTasks ?? [], id);
    mutateCurrent(
      (prev) => prev?.filter((t) => t.id !== id && !descendantIds.has(t.id)),
      { revalidate: true }
    );
    window.dispatchEvent(new Event("tasks-changed"));
  }

  function handleReopen(id: string) {
    const reopened = rawCompleted?.find((t) => t.id === id);
    mutateCompleted(
      (prev) => prev?.filter((t) => t.id !== id),
      { revalidate: true }
    );
    if (reopened) {
      mutateCurrent(
        (prev) => [...(prev ?? []), { ...reopened, status: 0 as const, completed_at: undefined }],
        { revalidate: true }
      );
    }
    window.dispatchEvent(new Event("tasks-changed"));
  }

  function handleUpdate(id: string, updates: Partial<Task>) {
    mutateCurrent(
      (prev) => prev?.map((t) => t.id === id ? { ...t, ...updates } : t),
      { revalidate: true }
    );
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

      <PersonalDailySummary />

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
        hasMoreCompleted={hasMoreCompleted}
        onLoadMore={loadMoreCompleted}
        isLoadingMore={isLoadingMoreCompleted}
      />
    </div>
  );
}
