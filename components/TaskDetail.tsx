"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { RichText } from "@/components/RichText";
import { DateTimePicker } from "@/components/DateTimePicker";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { Task, TaskLog, TaskMember } from "@/lib/types";
import { getDisplayLabel } from "@/lib/display-utils";
import { formatDateTime } from "@/lib/date-utils";

interface Props {
  task: Task;
  currentUserEmail?: string;
  members?: TaskMember[];
  onUpdate?: (id: string, updates: Partial<Task>) => void;
  onComplete?: (id: string) => void;
  onDelete?: (id: string) => void;
  readonly?: boolean;
  mode?: "standalone" | "embedded";
}

const PRIORITY_OPTIONS: Array<{
  value: 0 | 1 | 2 | 3;
  label: string;
  name: string;
  cls: string;
  activeCls: string;
}> = [
  { value: 0, label: "P0", name: "紧急", cls: "text-destructive/60 border-destructive/20 hover:bg-destructive/10", activeCls: "bg-destructive/10 text-destructive border-destructive/30 font-medium" },
  { value: 1, label: "P1", name: "高", cls: "text-warning/60 border-warning/20 hover:bg-warning/10", activeCls: "bg-warning/10 text-warning border-warning/30 font-medium" },
  { value: 2, label: "P2", name: "普通", cls: "text-charcoal/60 border-border hover:bg-muted", activeCls: "bg-muted text-charcoal border-border font-medium" },
  { value: 3, label: "P3", name: "低", cls: "text-muted-foreground/60 border-border/50 hover:bg-muted/50", activeCls: "bg-muted/50 text-muted-foreground border-border/50 font-medium" },
];

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  const days = Math.floor(hrs / 24);
  return `${days} 天前`;
}

export function TaskDetail({
  task,
  currentUserEmail,
  members: membersProp,
  onUpdate,
  onComplete,
  onDelete,
  readonly = false,
  mode = "standalone",
}: Props) {
  // ─── All hooks at the top, before any conditional returns ──────────
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [description, setDescription] = useState(task.description ?? "");
  const [savingDesc, setSavingDesc] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Standalone mode: title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Priority
  const [localPriority, setLocalPriority] = useState(task.priority);

  // Tags
  const [localTags, setLocalTags] = useState(task.tags ?? []);
  const [tagAdding, setTagAdding] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Progress
  const [localProgress, setLocalProgress] = useState(task.progress);

  // Assignee
  const [members, setMembers] = useState<TaskMember[]>(membersProp ?? []);
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  // Completing / deleting / reopening
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reopening, setReopening] = useState(false);

  // Sync props
  useEffect(() => { setDescription(task.description ?? ""); }, [task.description]);
  useEffect(() => { setTitleDraft(task.title); }, [task.title]);
  useEffect(() => { setLocalPriority(task.priority); }, [task.priority]);
  useEffect(() => { setLocalTags(task.tags ?? []); }, [task.tags]);
  useEffect(() => { setLocalProgress(task.progress); }, [task.progress]);

  // Fetch members if not passed but space_id exists
  useEffect(() => {
    if (membersProp) { setMembers(membersProp); return; }
    if (!task.space_id) return;
    fetch(`/api/spaces/${task.space_id}/members`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setMembers(data); })
      .catch(() => {});
  }, [task.space_id, membersProp]);

  // Fetch logs
  useEffect(() => {
    fetch(`/api/tasks/${task.id}/logs`)
      .then((r) => r.json())
      .then((data: TaskLog[]) => {
        setLogs(Array.isArray(data) ? data : []);
        setLogsLoaded(true);
      })
      .catch(() => setLogsLoaded(true));
  }, [task.id]);

  // Auto-focus tag input
  useEffect(() => {
    if (tagAdding && tagInputRef.current) tagInputRef.current.focus();
  }, [tagAdding]);

  // Auto-focus title input
  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  // ─── PATCH helper ──────────────────────────────────────────────────
  const patchTask = useCallback(async (updates: Record<string, unknown>) => {
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) onUpdate?.(task.id, updates as Partial<Task>);
  }, [task.id, onUpdate]);

  // ─── Handlers ──────────────────────────────────────────────────────
  async function saveDescription() {
    const trimmed = description.trim();
    if (trimmed === (task.description ?? "")) return;
    setSavingDesc(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: trimmed || null }),
      });
      if (res.ok) {
        onUpdate?.(task.id, { description: trimmed || undefined });
      }
    } finally {
      setSavingDesc(false);
    }
  }

  async function submitComment() {
    const trimmed = comment.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      if (res.ok) {
        const newLog: TaskLog = await res.json();
        setLogs((prev) => [...prev, newLog]);
        setComment("");
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function saveTitle() {
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    if (!trimmed || trimmed === task.title) return;
    await patchTask({ title: trimmed });
  }

  async function handlePrioritySelect(value: Task["priority"]) {
    setLocalPriority(value);
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

  async function handleTagRemove(tag: string) {
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

  async function handleComplete() {
    if (completing) return;
    setCompleting(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complete: true }),
      });
      if (res.ok) onComplete?.(task.id);
    } finally {
      setCompleting(false);
    }
  }

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (res.ok) onDelete?.(task.id);
    } finally {
      setDeleting(false);
    }
  }

  async function handleReopen() {
    if (reopening) return;
    setReopening(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reopen: true }),
      });
      if (res.ok) onUpdate?.(task.id, { status: 0, completed_at: undefined });
    } finally {
      setReopening(false);
    }
  }

  // ─── Derived ───────────────────────────────────────────────────────
  const isStandalone = mode === "standalone";
  const isCompleted = task.status === 2;
  const assigneeMember = task.assignee_email ? members.find((m) => m.email === task.assignee_email) : undefined;
  const assigneeLabel = task.assignee_email ? getDisplayLabel(task.assignee_email, assigneeMember) : null;

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4">

      {/* ── Title (standalone only) ───────────────────────────────── */}
      {isStandalone && (
        <div>
          {readonly || isCompleted ? (
            <h2 className={`text-lg font-semibold ${isCompleted ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {task.title}
            </h2>
          ) : editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); saveTitle(); }
                if (e.key === "Escape") { setEditingTitle(false); setTitleDraft(task.title); }
              }}
              className="w-full text-lg font-semibold bg-transparent border-b-2 border-sage outline-none pb-0.5 text-foreground"
            />
          ) : (
            <h2
              className="text-lg font-semibold text-foreground cursor-text hover:text-sage transition-colors"
              onClick={() => setEditingTitle(true)}
              title="点击编辑标题"
            >
              {task.title}
            </h2>
          )}
        </div>
      )}

      {/* ── Metadata section ──────────────────────────────────────── */}
      <div className="space-y-3">

        {/* Priority */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-14 shrink-0">优先级</span>
          {readonly ? (
            <span className={`text-xs px-2 py-0.5 rounded border ${PRIORITY_OPTIONS[localPriority].activeCls}`}>
              {PRIORITY_OPTIONS[localPriority].label} {PRIORITY_OPTIONS[localPriority].name}
            </span>
          ) : (
            <div className="flex gap-1">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handlePrioritySelect(opt.value)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    localPriority === opt.value ? opt.activeCls : opt.cls
                  }`}
                  title={opt.name}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Due date */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-14 shrink-0">截止</span>
          {readonly ? (
            <span className="text-sm text-foreground">
              {task.due_date ? formatDateTime(task.due_date) : "未设置"}
            </span>
          ) : (
            <DateTimePicker
              value={task.due_date}
              onChange={(v) => handleDateChange("due_date", v)}
              field="due_date"
            >
              <button className="text-sm text-foreground hover:text-sage transition-colors">
                {task.due_date ? formatDateTime(task.due_date) : <span className="text-muted-foreground/50">未设置</span>}
              </button>
            </DateTimePicker>
          )}
        </div>

        {/* Start date */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-14 shrink-0">开始</span>
          {readonly ? (
            <span className="text-sm text-foreground">
              {task.start_date ? formatDateTime(task.start_date) : "未设置"}
            </span>
          ) : (
            <DateTimePicker
              value={task.start_date}
              onChange={(v) => handleDateChange("start_date", v)}
              field="start_date"
            >
              <button className="text-sm text-foreground hover:text-sage transition-colors">
                {task.start_date ? formatDateTime(task.start_date) : <span className="text-muted-foreground/50">未设置</span>}
              </button>
            </DateTimePicker>
          )}
        </div>

        {/* End date */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-14 shrink-0">结束</span>
          {readonly ? (
            <span className="text-sm text-foreground">
              {task.end_date ? formatDateTime(task.end_date) : "未设置"}
            </span>
          ) : (
            <DateTimePicker
              value={task.end_date}
              onChange={(v) => handleDateChange("end_date", v)}
              field="end_date"
            >
              <button className="text-sm text-foreground hover:text-sage transition-colors">
                {task.end_date ? formatDateTime(task.end_date) : <span className="text-muted-foreground/50">未设置</span>}
              </button>
            </DateTimePicker>
          )}
        </div>

        {/* Assignee (space tasks only) */}
        {task.space_id && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-14 shrink-0">负责人</span>
            {readonly ? (
              <span className="text-sm text-foreground">
                {assigneeLabel ?? "未指派"}
              </span>
            ) : (
              <Popover open={assigneeOpen} onOpenChange={setAssigneeOpen}>
                <PopoverTrigger asChild>
                  <button className="text-sm text-foreground hover:text-sage transition-colors flex items-center gap-1.5">
                    {task.assignee_email ? (
                      <>
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-sage/15 text-sage text-xs font-medium">
                          {(assigneeLabel ?? "?")[0]?.toUpperCase()}
                        </span>
                        <span>{assigneeLabel}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground/50">未指派</span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[180px] p-1">
                  <button
                    onClick={() => handleAssigneeSelect("")}
                    className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-muted transition-colors ${!task.assignee_email ? "text-sage font-medium" : "text-muted-foreground"}`}
                  >
                    未指派
                  </button>
                  {members
                    .filter((m) => m.status === "active")
                    .map((m) => (
                      <button
                        key={m.user_id}
                        onClick={() => handleAssigneeSelect(m.email)}
                        className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs rounded hover:bg-muted transition-colors ${task.assignee_email === m.email ? "font-medium text-sage bg-muted/50" : "text-foreground"}`}
                      >
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-sage/15 text-sage font-medium text-[10px]">
                          {getDisplayLabel(m.email, m)[0]?.toUpperCase()}
                        </span>
                        {getDisplayLabel(m.email, m)}
                      </button>
                    ))}
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}

        {/* Tags */}
        <div className="flex items-start gap-3">
          <span className="text-xs text-muted-foreground w-14 shrink-0 mt-0.5">标签</span>
          <div className="flex flex-wrap gap-1.5 items-center">
            {localTags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded bg-muted text-charcoal">
                #{tag}
                {!readonly && (
                  <button
                    onClick={() => handleTagRemove(tag)}
                    className="text-muted-foreground/60 hover:text-foreground transition-colors text-[10px] ml-0.5"
                    title="删除标签"
                  >
                    x
                  </button>
                )}
              </span>
            ))}
            {localTags.length === 0 && readonly && (
              <span className="text-sm text-muted-foreground/50">无标签</span>
            )}
            {!readonly && (
              tagAdding ? (
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
                  className="text-xs bg-transparent border-b border-sage/50 outline-none w-16 py-0.5 placeholder:text-muted-foreground/30"
                />
              ) : (
                <button
                  onClick={() => setTagAdding(true)}
                  className="text-xs text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors px-1.5 py-0.5 rounded border border-dashed border-border/50 hover:border-border"
                  title="添加标签"
                >
                  +#
                </button>
              )
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-14 shrink-0">进度</span>
          {readonly ? (
            <div className="flex items-center gap-2">
              <div className="relative w-24 h-2 bg-muted/60 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-sage/60 rounded-full"
                  style={{ width: `${localProgress}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">{localProgress}%</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1 max-w-[200px]">
                <div className="w-full h-2 bg-muted/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sage/60 rounded-full transition-all duration-75"
                    style={{ width: `${localProgress}%` }}
                  />
                </div>
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
              <span className="text-xs text-muted-foreground w-8 text-right">{localProgress}%</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Description ───────────────────────────────────────────── */}
      <div>
        {readonly ? (
          description ? (
            <RichText text={description} className="text-sm text-foreground/80" />
          ) : (
            <p className="text-sm text-muted-foreground/50">无描述</p>
          )
        ) : (
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveDescription}
            disabled={savingDesc}
            placeholder="添加描述（AI 会参考描述来理解任务，建议填写）"
            rows={2}
            className="w-full text-sm bg-muted/40 border border-border/50 rounded-md px-3 py-2 resize-none outline-none focus:border-sage/50 placeholder:text-muted-foreground/50 transition-colors min-h-[72px]"
          />
        )}
      </div>

      {/* ── Logs ──────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">进展更新</p>
        {!logsLoaded ? (
          <p className="text-sm text-muted-foreground/50">加载中...</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground/50">暂无进展记录</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {logs.map((log) => {
              const logMember = members?.find((mb) => mb.email === log.user_email);
              const logLabel = getDisplayLabel(log.user_email, logMember);
              return (
                <div key={log.id} className="flex gap-2.5">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium uppercase">
                    {logLabel[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-medium">
                        {log.user_email === currentUserEmail ? "你" : logLabel}
                      </span>
                      <span className="text-xs text-muted-foreground/50">{formatRelativeTime(log.created_at)}</span>
                    </div>
                    <RichText text={log.content} className="text-sm text-foreground/80 mt-0.5" />
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Add comment ───────────────────────────────────────────── */}
      {!readonly && (
        <div className="flex gap-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submitComment(); } }}
            placeholder="添加进展更新...（Cmd+Enter 发送）"
            disabled={submitting}
            rows={2}
            className="flex-1 text-sm bg-muted/40 border border-border/50 rounded-md px-3 py-2 resize-none outline-none focus:border-sage/50 placeholder:text-muted-foreground/50 transition-colors"
          />
          <button
            onClick={submitComment}
            disabled={!comment.trim() || submitting}
            className="text-sm px-3 py-1.5 rounded-md bg-sage/10 text-sage hover:bg-sage/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors self-end"
          >
            发送
          </button>
        </div>
      )}

      {/* ── Bottom actions (standalone only) ──────────────────────── */}
      {isStandalone && !readonly && (
        <div className="flex gap-2 pt-2 border-t border-border/40">
          {isCompleted ? (
            <button
              onClick={handleReopen}
              disabled={reopening}
              className="text-xs px-3 py-1.5 rounded-md bg-sage/10 text-sage border border-sage/30 hover:bg-sage/20 disabled:opacity-50 transition-colors"
            >
              {reopening ? "重新打开中..." : "重新打开"}
            </button>
          ) : (
            <>
              <button
                onClick={handleComplete}
                disabled={completing}
                className="text-xs px-3 py-1.5 rounded-md bg-sage text-white hover:bg-sage-light disabled:opacity-50 transition-colors"
              >
                {completing ? "完成中..." : "标记完成"}
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    disabled={deleting}
                    className="text-xs px-3 py-1.5 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                  >
                    {deleting ? "删除中..." : "删除"}
                  </button>
                </AlertDialogTrigger>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
