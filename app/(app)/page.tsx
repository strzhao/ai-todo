"use client";

import { useEffect, useState } from "react";
import { NLInput } from "@/components/NLInput";
import { MultiTaskPreview } from "@/components/MultiTaskPreview";
import { TaskList } from "@/components/TaskList";
import type { ParsedTask, Task } from "@/lib/types";

export default function TodayPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [preview, setPreview] = useState<{ parsed: ParsedTask[]; raw: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/tasks?filter=today").then((r) => r.json()),
      fetch("/api/tasks?filter=today&include_completed=1").then((r) => r.json()),
    ]).then(([active, completed]: [Task[], Task[]]) => {
      setTasks(active);
      setCompletedTasks(completed.filter((t) => t.status === 2));
    }).finally(() => setLoading(false));
  }, []);

  function handleConfirm(newTasks: Task[]) {
    setTasks((prev) => [...newTasks, ...prev]);
    setPreview(null);
  }

  function handleComplete(id: string) {
    const completed = tasks.find((t) => t.id === id);
    setTasks((prev) => prev.filter((t) => t.id !== id && t.parent_id !== id));
    if (completed) setCompletedTasks((prev) => [{ ...completed, status: 2 as const }, ...prev].slice(0, 20));
  }

  function handleDelete(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id && t.parent_id !== id));
  }

  function handleUpdate(id: string, updates: Partial<Task>) {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...updates } : t));
  }

  const today = new Date().toLocaleDateString("zh-CN", {
    month: "long", day: "numeric", weekday: "long",
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">今日待办</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{today}</p>
      </div>

      <div className="mb-4">
        <NLInput onParsed={(tasks, r) => setPreview({ parsed: tasks, raw: r })} />
      </div>

      {preview && (
        <div className="mb-4">
          <MultiTaskPreview tasks={preview.parsed} raw={preview.raw} onConfirm={handleConfirm} onCancel={() => setPreview(null)} />
        </div>
      )}

      <TaskList
        tasks={tasks}
        completedTasks={completedTasks}
        loading={loading}
        onComplete={handleComplete}
        onDelete={handleDelete}
        onUpdate={handleUpdate}
        emptyText="今日暂无任务"
        emptySubtext="输入一句话快速创建任务"
      />
    </div>
  );
}
