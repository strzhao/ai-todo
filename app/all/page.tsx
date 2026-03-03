"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NLInput } from "@/components/NLInput";
import { ParsePreviewCard } from "@/components/ParsePreviewCard";
import { TaskList } from "@/components/TaskList";
import type { ParsedTask, Task } from "@/lib/types";

export default function AllTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [preview, setPreview] = useState<{ parsed: ParsedTask; raw: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((data: Task[]) => setTasks(data))
      .finally(() => setLoading(false));
  }, []);

  function handleConfirm(task: Task) {
    setTasks((prev) => [task, ...prev]);
    setPreview(null);
  }

  function handleComplete(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function handleDelete(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">全部任务</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{tasks.length} 个待办</p>
          </div>
          <nav className="flex gap-1">
            <Link href="/" className="text-sm px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              今日
            </Link>
            <span className="text-sm px-3 py-1.5 rounded-md bg-primary/10 text-primary font-medium">全部</span>
          </nav>
        </div>

        <div className="mb-4">
          <NLInput onParsed={(p, r) => setPreview({ parsed: p, raw: r })} />
        </div>

        {preview && (
          <div className="mb-4">
            <ParsePreviewCard
              parsed={preview.parsed}
              onConfirm={handleConfirm}
              onCancel={() => setPreview(null)}
            />
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-sm text-muted-foreground">加载中...</div>
        ) : (
          <TaskList
            tasks={tasks}
            onComplete={handleComplete}
            onDelete={handleDelete}
            emptyText="还没有任务，试着输入一句话"
          />
        )}
      </div>
    </div>
  );
}
