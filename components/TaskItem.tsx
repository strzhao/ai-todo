"use client";

import { useState, useRef, useEffect, memo, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskDetail } from "@/components/TaskDetail";
import { RichText } from "@/components/RichText";
import type { Task, TaskMember } from "@/lib/types";
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
  members?: TaskMember[];
}

export const TaskItem = memo(function TaskItem({ task, subtasks, onComplete, onDelete, onUpdate, currentUserEmail, highlightTodayDue = false, members: membersProp }: Props) {
  const router = useRouter();
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

  // Inline editing state
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [dateEditing, setDateEditing] = useState<"due_date" | "start_date" | "end_date" | null>(null);
  const [tagAdding, setTagAdding] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [localProgress, setLocalProgress] = useState(task.progress);
  const [tagInput, setTagInput] = useState("");
  const [members, setMembers] = useState<TaskMember[]>([]);
  const [localTags, setLocalTags] = useState(task.tags ?? []);

  const priorityRef = useRef<HTMLDivElement>(null);
  const assigneeRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const p = PRIORITY_BADGES[task.priority] ?? PRIORITY_BADGES[2];
  const hasSubtasks = (subtasks?.length ?? 0) > 0;

  // Sync local state when task prop changes
  useEffect(() => { setLocalProgress(task.progress); }, [task.progress]);
  useEffect(() => { setLocalTags(task.tags ?? []); }, [task.tags]);

  // Use members from props if available, otherwise fetch
  useEffect(() => {
    if (membersProp) { setMembers(membersProp); return; }
    if (!task.space_id) return;
    fetch(`/api/spaces/${task.space_id}/members`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setMembers(data); })
      .catch(() => {});
  }, [task.space_id, membersProp]);

  // Close popovers on outside click
  useEffect(() => {
    const anyOpen = moreOpen || priorityOpen || assigneeOpen;
    if (!anyOpen) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (moreOpen && moreRef.current && !moreRef.current.contains(target)) setMoreOpen(false);
      if (priorityOpen && priorityRef.current && !priorityRef.current.contains(target)) setPriorityOpen(false);
      if (assigneeOpen && assigneeRef.current && !assigneeRef.current.contains(target)) setAssigneeOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen, priorityOpen, assigneeOpen]);

  // Auto-focus date input
  useEffect(() => {
    if (dateEditing && dateInputRef.current) {
      dateInputRef.current.focus();
      dateInputRef.current.showPicker?.();
    }
  }, [dateEditing]);

  // Auto-focus tag input
  useEffect(() => {
    if (tagAdding && tagInputRef.current) tagInputRef.current.focus();
  }, [tagAdding]);

  // ─── PATCH helper ──────────────────────────────────────────────────
  async function patchTask(updates: Record<string, unknown>) {
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) onUpdate?.(task.id, updates as Partial<Task>);
  }

  // ─── Task actions ──────────────────────────────────────────────────
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
    router.refresh();
    window.dispatchEvent(new Event("tasks-changed"));
  }

  async function handleUnpin() {
    setMoreOpen(false);
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unpin" }),
    });
    router.refresh();
    window.dispatchEvent(new Event("tasks-changed"));
  }

  // ─── Title editing ─────────────────────────────────────────────────
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

  // ─── Inline edit handlers ─────────────────────────────────────────
  async function handlePrioritySelect(value: Task["priority"]) {
    setPriorityOpen(false);
    await patchTask({ priority: value });
  }

  async function handleDateSave(field: "due_date" | "start_date" | "end_date", value: string) {
    setDateEditing(null);
    await patchTask({ [field]: value || null });
  }

  async function handleTagAdd() {
    const trimmed = tagInput.trim();
    if (!trimmed || localTags.includes(trimmed)) { setTagInput(""); return; }
    const updated = [...localTags, trimmed];
    setLocalTags(updated);
    setTagInput("");
    setTagAdding(false);
    await patchTask({ tags: updated });
  }

  async function handleTagRemove(e: React.MouseEvent, tag: string) {
    e.stopPropagation();
    const updated = localTags.filter((t) => t !== tag);
    setLocalTags(updated);
    await patchTask({ tags: updated });
  }

  async function handleAssigneeSelect(email: string) {
    setAssigneeOpen(false);
    await patchTask({ assignee_email: email || null });
  }

  async function handleProgressCommit() {
    await patchTask({ progress: localProgress });
  }

  // ─── Date formatting ──────────────────────────────────────────────
  function formatDue(iso?: string) {
    if (!iso) return null;
    const d = new Date(iso);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    return isToday
      ? d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  }

  function formatShortDate(iso?: string) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  }

  function isDateToday(iso?: string) {
    if (!iso) return false;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    return d.toDateString() === new Date().toDateString();
  }

  function toDateInputValue(iso?: string): string {
    if (!iso) return "";
    return new Date(iso).toISOString().slice(0, 10);
  }

  const dueText = formatDue(task.due_date);
  const isDueToday = highlightTodayDue && isDateToday(task.due_date);
  const isAssignedToOther = task.assignee_email && task.assignee_email !== currentUserEmail;
  const assigneeLabel = task.assignee_email ? task.assignee_email.split("@")[0] : null;

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
              <RichText text={task.title} truncate />
            </p>
          )}
          {task.description && (
            <RichText text={task.description} truncate className="text-sm text-muted-foreground mt-0.5" />
          )}

          {/* Interactive badge row */}
          <div className="flex gap-1.5 mt-1.5 flex-wrap items-center">

            {/* Priority — clickable with popover */}
            <div className="relative" ref={priorityRef}>
              <Badge
                variant="outline"
                className={`text-xs px-1.5 py-0 cursor-pointer hover:opacity-80 transition-opacity ${p.cls}`}
                onClick={() => setPriorityOpen((v) => !v)}
              >
                {p.label}
              </Badge>
              {priorityOpen && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-md shadow-lg py-1 flex flex-col w-max">
                  {([0, 1, 2, 3] as const).map((v) => {
                    const opt = PRIORITY_BADGES[v];
                    return (
                      <button
                        key={v}
                        onClick={() => handlePrioritySelect(v)}
                        className={`flex items-center gap-2 text-xs px-3 py-1.5 text-left hover:bg-muted transition-colors ${task.priority === v ? "font-medium bg-muted/50" : ""}`}
                      >
                        <span className={`inline-flex items-center justify-center w-5 h-4 rounded text-[10px] font-medium ${opt.cls}`}>{opt.label}</span>
                        <span className="text-foreground">{["紧急", "高", "普通", "低"][v]}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Due date — click to edit */}
            {dateEditing === "due_date" ? (
              <input
                ref={dateInputRef}
                type="date"
                defaultValue={toDateInputValue(task.due_date)}
                onBlur={(e) => handleDateSave("due_date", e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setDateEditing(null); }}
                className="text-xs bg-background border border-border rounded-md px-2 py-1 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 shadow-sm w-[130px] transition-colors"
              />
            ) : dueText ? (
              <span
                className={`text-xs cursor-pointer hover:opacity-70 transition-opacity ${isDueToday ? "text-[var(--today-accent-strong)] font-medium" : "text-muted-foreground"}`}
                onClick={() => setDateEditing("due_date")}
                title="点击修改截止日期"
              >
                📅 {dueText}
              </span>
            ) : (
              <span
                className="text-xs text-muted-foreground/30 cursor-pointer hover:text-muted-foreground/60 transition-colors"
                onClick={() => setDateEditing("due_date")}
                title="设置截止日期"
              >
                +📅
              </span>
            )}

            {isDueToday && (
              <span className="today-task-pill">今日优先</span>
            )}

            {/* Start date */}
            {dateEditing === "start_date" ? (
              <input
                ref={dateInputRef}
                type="date"
                defaultValue={toDateInputValue(task.start_date)}
                onBlur={(e) => handleDateSave("start_date", e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setDateEditing(null); }}
                className="text-xs bg-background border border-border rounded-md px-2 py-1 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 shadow-sm w-[130px] transition-colors"
              />
            ) : task.start_date ? (
              <span
                className="text-xs text-muted-foreground cursor-pointer hover:opacity-70 transition-opacity"
                onClick={() => setDateEditing("start_date")}
                title="点击修改开始日期"
              >
                ▸{formatShortDate(task.start_date)}
              </span>
            ) : null}

            {/* End date */}
            {dateEditing === "end_date" ? (
              <input
                ref={dateInputRef}
                type="date"
                defaultValue={toDateInputValue(task.end_date)}
                onBlur={(e) => handleDateSave("end_date", e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setDateEditing(null); }}
                className="text-xs bg-background border border-border rounded-md px-2 py-1 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 shadow-sm w-[130px] transition-colors"
              />
            ) : task.end_date ? (
              <span
                className="text-xs text-muted-foreground cursor-pointer hover:opacity-70 transition-opacity"
                onClick={() => setDateEditing("end_date")}
                title="点击修改结束日期"
              >
                ◂{formatShortDate(task.end_date)}
              </span>
            ) : null}

            {/* Tags — with inline × and + */}
            {localTags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-0.5 text-xs text-muted-foreground group/tag">
                #{tag}
                <button
                  onClick={(e) => handleTagRemove(e, tag)}
                  className="opacity-0 group-hover/tag:opacity-100 text-muted-foreground/60 hover:text-foreground transition-opacity text-[10px] -ml-0.5"
                  title="删除标签"
                >
                  ×
                </button>
              </span>
            ))}
            {tagAdding ? (
              <input
                ref={tagInputRef}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleTagAdd(); }
                  if (e.key === "Escape") { setTagAdding(false); setTagInput(""); }
                }}
                onBlur={() => { if (!tagInput.trim()) { setTagAdding(false); setTagInput(""); } else { handleTagAdd(); } }}
                placeholder="#标签"
                className="text-xs bg-transparent border-b border-primary/50 outline-none w-14 py-0 placeholder:text-muted-foreground/30"
              />
            ) : (
              <button
                onClick={() => setTagAdding(true)}
                className="text-xs text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
                title="添加标签"
              >
                +#
              </button>
            )}

            {/* Progress — mini bar with drag */}
            {(localProgress > 0 || task.status !== 2) && (
              <div className="inline-flex items-center gap-1 group/progress" title={`进度 ${localProgress}%`}>
                <div className="relative w-16 h-1.5 bg-muted/60 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-primary/60 rounded-full transition-all duration-75"
                    style={{ width: `${localProgress}%` }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={localProgress}
                    onChange={(e) => setLocalProgress(Number(e.target.value))}
                    onMouseUp={handleProgressCommit}
                    onTouchEnd={handleProgressCommit}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
                <span className="text-[10px] text-muted-foreground w-6 text-right">{localProgress}%</span>
                {localProgress === 100 && task.status !== 2 && (
                  <button
                    onClick={handleComplete}
                    className="text-[10px] text-primary hover:text-primary/80 transition-colors"
                    title="标记为已完成"
                  >
                    ✓
                  </button>
                )}
              </div>
            )}

            {/* Assignee — clickable with popover */}
            {task.space_id && (
              <div className="relative" ref={assigneeRef}>
                {isAssignedToOther || task.assignee_email ? (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer hover:opacity-70 transition-opacity"
                    onClick={() => setAssigneeOpen((v) => !v)}
                    title="点击修改负责人"
                  >
                    <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-primary/20 text-primary font-medium text-[9px]">
                      {(assigneeLabel ?? "?")[0]?.toUpperCase()}
                    </span>
                    <span>{assigneeLabel}</span>
                  </span>
                ) : (
                  <span
                    className="text-xs text-muted-foreground/30 cursor-pointer hover:text-muted-foreground/60 transition-colors"
                    onClick={() => setAssigneeOpen((v) => !v)}
                    title="指派负责人"
                  >
                    +@
                  </span>
                )}
                {assigneeOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-md shadow-lg py-1 min-w-[140px]">
                    <button
                      onClick={() => handleAssigneeSelect("")}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors ${!task.assignee_email ? "text-primary font-medium" : "text-muted-foreground"}`}
                    >
                      未指派
                    </button>
                    {members
                      .filter((m) => m.status === "active")
                      .map((m) => (
                        <button
                          key={m.user_id}
                          onClick={() => handleAssigneeSelect(m.email)}
                          className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors ${task.assignee_email === m.email ? "font-medium text-primary bg-muted/50" : "text-foreground"}`}
                        >
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary/15 text-primary font-medium text-[10px]">
                            {(m.display_name || m.email)[0]?.toUpperCase()}
                          </span>
                          {m.display_name || m.email.split("@")[0]}
                        </button>
                      ))}
                  </div>
                )}
              </div>
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

        {/* Detail expand */}
        <button
          onClick={() => setDetailOpen((v) => !v)}
          className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 flex items-center justify-center text-sm text-muted-foreground hover:text-foreground"
          title="查看详情"
          tabIndex={-1}
          aria-label="展开详情"
        >
          {detailOpen ? "▲" : "▼"}
        </button>

        {/* More menu */}
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
            <div className="absolute right-0 top-full mt-1 z-50 bg-background border border-border rounded-md shadow-lg min-w-[88px] py-1">
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

      {/* Detail panel — only description + logs */}
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
});
