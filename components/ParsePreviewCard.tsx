"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ParsedTask, Task } from "@/lib/types";

const PRIORITY_LABELS: Record<number, string> = { 0: "P0 紧急", 1: "P1 高", 2: "P2 普通", 3: "P3 低" };
const PRIORITY_COLORS: Record<number, string> = {
  0: "bg-red-100 text-red-700 border-red-200",
  1: "bg-orange-100 text-orange-700 border-orange-200",
  2: "bg-blue-100 text-blue-700 border-blue-200",
  3: "bg-gray-100 text-gray-600 border-gray-200",
};

interface Props {
  parsed: ParsedTask;
  onConfirm: (task: Task) => void;
  onCancel: () => void;
}

export function ParsePreviewCard({ parsed, onConfirm, onCancel }: Props) {
  const [form, setForm] = useState<ParsedTask>({ ...parsed });
  const [loading, setLoading] = useState(false);

  function formatDueDate(iso?: string) {
    if (!iso) return null;
    return new Date(iso).toLocaleString("zh-CN", {
      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
  }

  async function confirm() {
    if (!form.title.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("创建失败");
      const task = await res.json() as Task;
      onConfirm(task);
    } catch (e) {
      console.error(e);
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

        {/* 截止时间 + 优先级 */}
        <div className="flex gap-2 flex-wrap">
          {form.due_date && (
            <Badge variant="outline" className="text-xs">
              📅 {formatDueDate(form.due_date)}
            </Badge>
          )}
          <Badge
            variant="outline"
            className={`text-xs ${PRIORITY_COLORS[form.priority ?? 2]}`}
          >
            {PRIORITY_LABELS[form.priority ?? 2]}
          </Badge>
          {form.tags?.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              #{tag}
            </Badge>
          ))}
        </div>

        {/* 描述 */}
        {form.description && (
          <p className="text-sm text-muted-foreground">{form.description}</p>
        )}

        {/* 操作 */}
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={confirm} disabled={!form.title.trim() || loading}>
            {loading ? "创建中..." : "确认创建"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            取消
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
