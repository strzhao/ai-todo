"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ParsedTask, Task } from "@/lib/types";

const PRIORITY_LABELS: Record<number, string> = { 0: "P0 紧急", 1: "P1 高", 2: "P2 普通", 3: "P3 低" };
const PRIORITY_COLORS: Record<number, string> = {
  0: "bg-danger-soft text-danger border-danger/35",
  1: "bg-warning-soft text-warning border-warning/40",
  2: "bg-info-soft text-info border-info/35",
  3: "bg-neutral-soft text-charcoal border-border/70",
};

interface Props {
  parsed: ParsedTask;
  onConfirm: (task: Task) => void;
  onCancel: () => void;
  spaceId?: string;
}

export function ParsePreviewCard({ parsed, onConfirm, onCancel, spaceId }: Props) {
  const [form, setForm] = useState<ParsedTask>({ ...parsed });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function formatDueDate(iso?: string) {
    if (!iso) return null;
    return new Date(iso).toLocaleString("zh-CN", {
      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  async function confirm() {
    if (!form.title.trim()) return;
    setLoading(true);
    setError("");
    try {
      const body = {
        ...form,
        ...(spaceId ? { space_id: spaceId } : {}),
        ...(form.assignee ? { assignee_email: form.assignee } : {}),
      };
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error || "创建失败，请重试");
        return;
      }
      const task = await res.json() as Task;
      onConfirm(task);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="pt-4 space-y-3">
        <p className="text-xs text-muted-foreground font-medium">AI 解析结果 · 确认后创建</p>

        {/* 标题 */}
        <div>
          <label className="text-xs text-muted-foreground">任务标题</label>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="mt-1"
            placeholder="任务标题"
          />
        </div>

        {/* 负责人（有 assignee 时显示） */}
        {form.assignee && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">负责人</span>
            <span className="text-xs font-medium">{form.assignee}</span>
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setForm({ ...form, assignee: undefined })}
            >
              ×
            </button>
          </div>
        )}

        {/* 截止时间 + 优先级 + 标签 */}
        <div className="flex gap-2 flex-wrap">
          {form.due_date && (
            <Badge variant="outline" className="text-xs">
              📅 {formatDueDate(form.due_date)}
            </Badge>
          )}
          <Badge variant="outline" className={`text-xs ${PRIORITY_COLORS[form.priority ?? 2]}`}>
            {PRIORITY_LABELS[form.priority ?? 2]}
          </Badge>
          {form.tags?.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">#{tag}</Badge>
          ))}
        </div>

        {/* 描述 */}
        {form.description && (
          <p className="text-sm text-muted-foreground">{form.description}</p>
        )}

        {/* 操作 */}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={confirm} disabled={!form.title.trim() || loading}>
            {loading ? "创建中..." : "确认创建"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>取消</Button>
        </div>
      </CardContent>
    </Card>
  );
}
