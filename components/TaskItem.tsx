"use client";

import { useState, useRef, useEffect, memo, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { TaskDetail } from "@/components/TaskDetail";
import { RichText } from "@/components/RichText";
import { DateTimePicker } from "@/components/DateTimePicker";
import { formatDateTime, isToday as isTodayFn } from "@/lib/date-utils";
import type { Task, TaskMember } from "@/lib/types";
import type { TaskNode } from "@/lib/task-utils";
import { getDisplayLabel } from "@/lib/display-utils";

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
  onDrillDown?: (taskId: string) => void;
  childCountMap?: Record<string, number>;
  focusedTaskId?: string | null;
  focusAncestorIds?: Set<string>;
}

export const TaskItem = memo(function TaskItem({ task, subtasks, onComplete, onDelete, onUpdate, currentUserEmail, highlightTodayDue = false, members: membersProp, onDrillDown, childCountMap, focusedTaskId, focusAncestorIds }: Props) {
  const router = useRouter();
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(() => focusAncestorIds?.has(task.id) ?? false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const isFocused = focusedTaskId === task.id;

  // Inline editing state
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [tagAdding, setTagAdding] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [localProgress, setLocalProgress] = useState(task.progress);
  const [tagInput, setTagInput] = useState("");
  const [members, setMembers] = useState<TaskMember[]>([]);
  const [localTags, setLocalTags] = useState(task.tags ?? []);

  const priorityRef = useRef<HTMLDivElement>(null);
  const assigneeRef = useRef<HTMLDivElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const p = PRIORITY_BADGES[task.priority] ?? PRIORITY_BADGES[2];
  const hasSubtasks = (subtasks?.length ?? 0) > 0 || (onDrillDown && (childCountMap?.[task.id] ?? 0) > 0);
  const subtaskCount = onDrillDown ? (childCountMap?.[task.id] ?? subtasks?.length ?? 0) : (subtasks?.length ?? 0);


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

  // Auto-focus tag input
  useEffect(() => {
    if (tagAdding && tagInputRef.current) tagInputRef.current.focus();
  }, [tagAdding]);

  // Scroll to focused task and auto-expand ancestors when focusedTaskId changes
  useEffect(() => {
    if (focusAncestorIds?.has(task.id)) setExpanded(true);
  }, [focusAncestorIds, task.id]);

  useEffect(() => {
    if (isFocused && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isFocused]);

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

  // ─── Title click: edit on desktop, toggle detail on mobile ────────
  function handleTitleClick() {
    if (window.matchMedia("(min-width: 768px)").matches) {
      startEdit();
    } else {
      setDetailOpen((v) => !v);
    }
  }

  function handleMobileDetailToggle() {
    if (!window.matchMedia("(min-width: 768px)").matches) {
      setDetailOpen((v) => !v);
    }
  }

  function toggleDetail() {
    setDetailOpen((v) => !v);
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
    if (e.key === "Enter") { e.preventDefault(); startEdit(); }
  }

  // ─── Inline edit handlers ─────────────────────────────────────────
  async function handlePrioritySelect(value: Task["priority"]) {
    setPriorityOpen(false);
    await patchTask({ priority: value });
  }

  async function handleDateChange(field: "due_date" | "start_date" | "end_date", value: string | null) {
    await patchTask({ [field]: value });
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

  const dueText = task.due_date ? formatDateTime(task.due_date) : null;
  const isDueToday = highlightTodayDue && task.due_date ? isTodayFn(new Date(task.due_date)) : false;
  const isAssignedToOther = task.assignee_email && task.assignee_email !== currentUserEmail;
  const assigneeMember = task.assignee_email ? members.find((m) => m.email === task.assignee_email) : undefined;
  const assigneeLabel = task.assignee_email ? getDisplayLabel(task.assignee_email, assigneeMember) : null;

  // Creator info for space tasks (hover display)
  const creatorMember = task.space_id ? members.find((m) => m.user_id === task.user_id) : undefined;
  const creatorLabel = creatorMember ? getDisplayLabel(creatorMember.email, creatorMember) : null;
  const showCreator = task.space_id && creatorLabel && creatorMember?.email !== currentUserEmail;

  return (
    <div id={`task-${task.id}`} ref={rowRef} className={`border-b last:border-0 border-border/50 ${completing ? "opacity-40" : ""} ${isFocused ? "animate-focus-flash" : ""}`}>
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
              onClick={handleTitleClick}
              title="单击编辑"
            >
              <RichText text={task.title} truncate />
              {task.milestone && <span className="text-[10px] text-sage ml-1" title={task.milestone}>{"\ud83d\udea9"}</span>}
            </p>
          )}
          {task.description && (
            <div className="text-sm text-muted-foreground mt-0.5 truncate md:pointer-events-none cursor-pointer md:cursor-default" onClick={handleMobileDetailToggle}>
              <RichText text={task.description} truncate />
            </div>
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

            {/* Due date — DateTimePicker */}
            <DateTimePicker
              value={task.due_date}
              onChange={(v) => handleDateChange("due_date", v)}
              field="due_date"
            >
              {dueText ? (
                <button
                  className={`text-xs cursor-pointer hover:opacity-70 transition-opacity ${isDueToday ? "text-[var(--today-accent-strong)] font-medium" : "text-muted-foreground"}`}
                  title="点击修改截止日期"
                >
                  📅 {dueText}
                </button>
              ) : (
                <button
                  className="text-xs text-muted-foreground/30 cursor-pointer hover:text-muted-foreground/60 transition-colors"
                  title="设置截止日期"
                >
                  +📅
                </button>
              )}
            </DateTimePicker>

            {isDueToday && (
              <span className="today-task-pill">今日优先</span>
            )}

            {/* Start date — DateTimePicker */}
            {task.start_date ? (
              <DateTimePicker
                value={task.start_date}
                onChange={(v) => handleDateChange("start_date", v)}
                field="start_date"
              >
                <button
                  className="text-xs text-muted-foreground cursor-pointer hover:opacity-70 transition-opacity"
                  title="点击修改开始日期"
                >
                  ▸{formatDateTime(task.start_date)}
                </button>
              </DateTimePicker>
            ) : null}

            {/* End date — DateTimePicker */}
            {task.end_date ? (
              <DateTimePicker
                value={task.end_date}
                onChange={(v) => handleDateChange("end_date", v)}
                field="end_date"
              >
                <button
                  className="text-xs text-muted-foreground cursor-pointer hover:opacity-70 transition-opacity"
                  title="点击修改结束日期"
                >
                  ◂{formatDateTime(task.end_date)}
                </button>
              </DateTimePicker>
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
                            {getDisplayLabel(m.email, m)[0]?.toUpperCase()}
                          </span>
                          {getDisplayLabel(m.email, m)}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Subtask count toggle */}
            {hasSubtasks && (
              <button
                onClick={() => {
                  if (onDrillDown) {
                    onDrillDown(task.id);
                  } else {
                    setExpanded((v) => !v);
                  }
                }}
                className="text-xs px-1.5 py-0 rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
              >
                {onDrillDown ? "▶" : (expanded ? "▼" : "▶")} {subtaskCount} 子任务
              </button>
            )}
          </div>
        </div>

        {/* Creator label — hover-visible, space tasks only */}
        {showCreator && (
          <span
            className="hidden md:inline opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-muted-foreground whitespace-nowrap"
            title={`创建者: ${creatorLabel}`}
          >
            {creatorLabel}
          </span>
        )}

        {/* Mobile detail toggle */}
        <button
          onClick={toggleDetail}
          className="md:hidden flex-shrink-0 h-7 w-7 flex items-center justify-center text-muted-foreground/60"
          aria-label="展开详情"
          tabIndex={-1}
        >
          <span className={`text-xs transition-transform ${detailOpen ? "rotate-90" : ""}`}>›</span>
        </button>

        {/* Detail expand */}
        <button
          onClick={toggleDetail}
          className="hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 items-center justify-center text-sm text-muted-foreground hover:text-foreground"
          title="查看详情"
          tabIndex={-1}
          aria-label="展开详情"
        >
          {detailOpen ? "▲" : "▼"}
        </button>

        {/* More menu */}
        <div className="relative hidden md:block" ref={moreRef}>
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
                onClick={() => { setMoreOpen(false); setDeleteConfirmOpen(true); }}
                disabled={deleting}
                className="w-full text-left px-3 py-1.5 text-sm text-destructive hover:bg-muted/60 disabled:opacity-50"
              >
                {deleting ? "删除中..." : "删除"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除任务「{task.title}」吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail panel — only description + logs */}
      {detailOpen && (
        <div className="mx-1 mb-3 mt-1 border border-border/40 rounded-lg bg-muted/20 overflow-hidden">
          <TaskDetail task={task} currentUserEmail={currentUserEmail} members={members} onUpdate={onUpdate} mode="embedded" />
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
              focusedTaskId={focusedTaskId}
              focusAncestorIds={focusAncestorIds}
            />
          ))}
        </div>
      )}
    </div>
  );
});
