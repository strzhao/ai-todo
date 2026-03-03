"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Task } from "@/lib/types";

const PRIORITY_BADGES: Record<number, { label: string; cls: string }> = {
  0: { label: "P0", cls: "bg-red-100 text-red-700 border-red-200" },
  1: { label: "P1", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  2: { label: "P2", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  3: { label: "P3", cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

interface Props {
  task: Task;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TaskItem({ task, onComplete, onDelete }: Props) {
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const p = PRIORITY_BADGES[task.priority] ?? PRIORITY_BADGES[2];

  async function handleComplete() {
    if (completing) return;
    setCompleting(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complete: true }),
      });
      if (res.ok) onComplete(task.id);
    } finally {
      setCompleting(false);
    }
  }

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (res.ok) onDelete(task.id);
    } finally {
      setDeleting(false);
    }
  }

  function formatDue(iso?: string) {
    if (!iso) return null;
    const d = new Date(iso);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    return isToday
      ? d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  }

  return (
    <div className={`flex items-start gap-3 py-3 px-1 group border-b last:border-0 border-border/50 transition-opacity ${completing ? "opacity-40" : ""}`}>
      {/* Checkbox */}
      <button
        onClick={handleComplete}
        className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 border-muted-foreground/40 hover:border-primary transition-colors"
        aria-label="完成任务"
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-5 truncate">{task.title}</p>
        {task.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.description}</p>
        )}
        <div className="flex gap-1.5 mt-1.5 flex-wrap">
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${p.cls}`}>
            {p.label}
          </Badge>
          {task.due_date && (
            <span className="text-[10px] text-muted-foreground">📅 {formatDue(task.due_date)}</span>
          )}
          {task.tags.map((tag) => (
            <span key={tag} className="text-[10px] text-muted-foreground">#{tag}</span>
          ))}
        </div>
      </div>

      {/* Delete */}
      <Button
        variant="ghost"
        size="sm"
        className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
        onClick={handleDelete}
        disabled={deleting}
        aria-label="删除任务"
      >
        ×
      </Button>
    </div>
  );
}
