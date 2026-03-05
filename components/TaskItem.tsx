"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AssigneeBadge } from "@/components/AssigneeBadge";
import { TaskDetail } from "@/components/TaskDetail";
import type { Task } from "@/lib/types";
import type { TaskNode } from "@/lib/task-utils";

const PRIORITY_BADGES: Record<number, { label: string; cls: string }> = {
  0: { label: "P0", cls: "bg-danger-soft text-danger border-danger/35" },
  1: { label: "P1", cls: "bg-warning-soft text-warning border-warning/40" },
  2: { label: "P2", cls: "bg-info-soft text-info border-info/35" },
  3: { label: "P3", cls: "bg-neutral-soft text-charcoal border-border/70" },
};

interface Props {
  task: Task;
  subtasks?: TaskNode[];
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<Task>) => void;
  currentUserEmail?: string;
  highlightTodayDue?: boolean;
}

export function TaskItem({ task, subtasks, onComplete, onDelete, onUpdate, currentUserEmail, highlightTodayDue = false }: Props) {
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const p = PRIORITY_BADGES[task.priority] ?? PRIORITY_BADGES[2];
  const hasSubtasks = (subtasks?.length ?? 0) > 0;

  // Close more menu on outside click
  useEffect(() => {
    if (!moreOpen) return;
    function handler(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

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
    setMoreOpen(false);
    setDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (res.ok) onDelete(task.id);
    } finally {
      setDeleting(false);
    }
  }

  async function handlePin() {
    setMoreOpen(false);
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pin" }),
    });
    window.location.reload();
  }

  async function handleUnpin() {
    setMoreOpen(false);
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unpin" }),
    });
    window.location.reload();
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

  function isDateToday(iso?: string) {
    if (!iso) return false;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    return d.toDateString() === new Date().toDateString();
  }

  const dueText = formatDue(task.due_date);
  const isDueToday = highlightTodayDue && isDateToday(task.due_date);
  const isAssignedToOther = task.assignee_email && task.assignee_email !== currentUserEmail;

  return (
    <div className={`border-b last:border-0 border-border/50 ${completing ? "opacity-40" : ""}`}>
      {/* Main task row */}
      <div
        className={`flex items-start gap-3 py-3 px-1 group transition-opacity focus-visible:outline-none focus-visible:bg-muted/40 rounded-sm ${isDueToday ? "today-task-row" : ""}`}
        tabIndex={0}
        onKeyDown={onRowKeyDown}
        aria-label={`任务: ${task.title}`}
      >
        {/* Checkbox */}
        <button
          onClick={handleComplete}
          className="mt-1 flex-shrink-0 w-4 h-4 rounded-full border-2 border-muted-foreground/40 hover:border-primary transition-colors"
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
              className="w-full text-base font-medium bg-transparent border-b-2 border-primary outline-none pb-0.5"
            />
          ) : (
            <p
              className="text-base font-medium leading-6 truncate cursor-text hover:text-primary/80 transition-colors"
              onClick={startEdit}
              title="单击编辑"
            >
              {task.title}
            </p>
          )}
          {task.description && (
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{task.description}</p>
          )}
          <div className="flex gap-1.5 mt-1.5 flex-wrap items-center">
            <Badge variant="outline" className={`text-xs px-1.5 py-0 ${p.cls}`}>
              {p.label}
            </Badge>
            {dueText && (
              <span className={`text-xs ${isDueToday ? "text-[var(--today-accent-strong)] font-medium" : "text-muted-foreground"}`}>
                📅 {dueText}
              </span>
            )}
            {isDueToday && (
              <span className="today-task-pill">
                今日优先
              </span>
            )}
            {task.tags.map((tag) => (
              <span key={tag} className="text-xs text-muted-foreground">#{tag}</span>
            ))}
            {isAssignedToOther && (
              <AssigneeBadge email={task.assignee_email!} isMe={false} />
            )}
            {/* Subtask count toggle */}
            {hasSubtasks && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="text-xs px-1.5 py-0 rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
              >
                {expanded ? "▼" : "▶"} {subtasks!.length} 子任务
              </button>
            )}
          </div>
        </div>

        {/* Detail expand - now in left action position */}
        <button
          onClick={() => setDetailOpen((v) => !v)}
          className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 flex items-center justify-center text-sm text-muted-foreground hover:text-foreground"
          title="查看详情"
          tabIndex={-1}
          aria-label="展开详情"
        >
          {detailOpen ? "▲" : "▼"}
        </button>

        {/* More menu with delete inside */}
        <div className="relative" ref={moreRef}>
          <Button
            variant="ghost"
            size="sm"
            className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setMoreOpen((v) => !v)}
            aria-label="更多操作"
            tabIndex={-1}
          >
            ⋮
          </Button>
          {moreOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-md min-w-[88px] py-1">
              {!task.parent_id && !task.pinned && (
                <button
                  onClick={handlePin}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/60"
                >
                  置顶到侧边栏
                </button>
              )}
              {!task.parent_id && task.pinned && (
                <button
                  onClick={handleUnpin}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/60"
                >
                  取消置顶
                </button>
              )}
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="w-full text-left px-3 py-1.5 text-sm text-destructive hover:bg-muted/60 disabled:opacity-50"
              >
                {deleting ? "删除中..." : "删除"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Detail panel - card style */}
      {detailOpen && (
        <div className="mx-1 mb-3 mt-1 border border-border/40 rounded-lg bg-muted/20 overflow-hidden">
          <TaskDetail task={task} currentUserEmail={currentUserEmail} onUpdate={onUpdate} />
        </div>
      )}

      {/* Subtasks (expanded) */}
      {expanded && hasSubtasks && (
        <div className="pl-7 pb-1">
          {subtasks!.map((sub) => (
            <TaskItem
              key={sub.id}
              task={sub}
              subtasks={sub.subtasks}
              onComplete={onComplete}
              onDelete={onDelete}
              onUpdate={onUpdate}
              currentUserEmail={currentUserEmail}
              highlightTodayDue={highlightTodayDue}
            />
          ))}
        </div>
      )}
    </div>
  );
}
