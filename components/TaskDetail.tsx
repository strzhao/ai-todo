"use client";

import { useState, useEffect, useRef } from "react";
import type { Task, TaskLog } from "@/lib/types";

interface Props {
  task: Task;
  currentUserEmail?: string;
  onUpdate?: (id: string, updates: Partial<Task>) => void;
}

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

function formatDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export function TaskDetail({ task, currentUserEmail, onUpdate }: Props) {
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [description, setDescription] = useState(task.description ?? "");
  const [savingDesc, setSavingDesc] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/tasks/${task.id}/logs`)
      .then((r) => r.json())
      .then((data: TaskLog[]) => {
        setLogs(Array.isArray(data) ? data : []);
        setLogsLoaded(true);
      })
      .catch(() => setLogsLoaded(true));
  }, [task.id]);

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

  const hasDateRange = task.start_date || task.end_date;

  return (
    <div className="text-xs text-muted-foreground space-y-3 pt-2">
      {/* Description */}
      <div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
          disabled={savingDesc}
          placeholder="添加描述..."
          rows={2}
          className="w-full text-xs bg-muted/40 border border-border/50 rounded px-2 py-1.5 resize-none outline-none focus:border-primary/50 placeholder:text-muted-foreground/50 transition-colors"
        />
      </div>

      {/* Date range */}
      {hasDateRange && (
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-muted-foreground/60">⏱</span>
          {task.start_date && <span>开始: {formatDate(task.start_date)}</span>}
          {task.start_date && task.end_date && <span className="text-muted-foreground/40">→</span>}
          {task.end_date && <span>结束: {formatDate(task.end_date)}</span>}
        </div>
      )}

      {/* Logs */}
      <div>
        <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide mb-1.5">进展更新</p>
        {!logsLoaded ? (
          <p className="text-[11px] text-muted-foreground/50">加载中...</p>
        ) : logs.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/50">暂无进展记录</p>
        ) : (
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {logs.map((log) => (
              <div key={log.id} className="flex gap-2">
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-medium uppercase">
                  {log.user_email[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-medium">
                    {log.user_email === currentUserEmail ? "你" : log.user_email.split("@")[0]}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50 ml-1">{formatRelativeTime(log.created_at)}</span>
                  <p className="text-[11px] text-foreground/80 mt-0.5 break-words">{log.content}</p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Add comment */}
      <div className="flex gap-2">
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
          placeholder="添加进展更新..."
          disabled={submitting}
          className="flex-1 text-xs bg-muted/40 border border-border/50 rounded px-2 py-1 outline-none focus:border-primary/50 placeholder:text-muted-foreground/50 transition-colors"
        />
        <button
          onClick={submitComment}
          disabled={!comment.trim() || submitting}
          className="text-[11px] px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          发送
        </button>
      </div>
    </div>
  );
}
