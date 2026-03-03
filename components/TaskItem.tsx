"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AssigneeBadge } from "@/components/AssigneeBadge";
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
  onUpdate?: (id: string, updates: Partial<Task>) => void;
  currentUserEmail?: string;
}

export function TaskItem({ task, onComplete, onDelete, onUpdate, currentUserEmail }: Props) {
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  function startEdit() {
    setEditTitle(task.title);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function saveEdit() {
    const trimmed = editTitle.trim();
    setEditing(false);
    if (!trimmed || trimmed === task.title) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (res.ok) onUpdate?.(task.id, { title: trimmed });
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditTitle(task.title);
    setEditing(false);
  }

  function onEditKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
    if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
  }

  function onRowKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (editing) return;
    if (e.key === " ") { e.preventDefault(); handleComplete(); }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); handleDelete(); }
    if (e.key === "Enter") { e.preventDefault(); startEdit(); }
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

  const isAssignedToOther = task.assignee_email && task.assignee_email !== currentUserEmail;

  return (
    <div
      className={`flex items-start gap-3 py-3 px-1 group border-b last:border-0 border-border/50 transition-opacity focus-visible:outline-none focus-visible:bg-muted/40 rounded-sm ${completing ? "opacity-40" : ""}`}
      tabIndex={0}
      onKeyDown={onRowKeyDown}
      aria-label={`任务: ${task.title}`}
    >
      {/* Checkbox */}
      <button
        onClick={handleComplete}
        className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 border-muted-foreground/40 hover:border-primary transition-colors"
        aria-label="完成任务"
        tabIndex={-1}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={onEditKeyDown}
            disabled={saving}
            className="w-full text-sm font-medium bg-transparent border-b-2 border-primary outline-none pb-0.5"
          />
        ) : (
          <p
            className="text-sm font-medium leading-5 truncate cursor-text hover:text-primary/80 transition-colors"
            onClick={startEdit}
            title="单击编辑"
          >
            {task.title}
          </p>
        )}
        {task.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.description}</p>
        )}
        <div className="flex gap-1.5 mt-1.5 flex-wrap items-center">
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${p.cls}`}>
            {p.label}
          </Badge>
          {task.due_date && (
            <span className="text-[10px] text-muted-foreground">📅 {formatDue(task.due_date)}</span>
          )}
          {task.tags.map((tag) => (
            <span key={tag} className="text-[10px] text-muted-foreground">#{tag}</span>
          ))}
          {isAssignedToOther && (
            <AssigneeBadge email={task.assignee_email!} isMe={false} />
          )}
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
        tabIndex={-1}
      >
        ×
      </Button>
    </div>
  );
}
