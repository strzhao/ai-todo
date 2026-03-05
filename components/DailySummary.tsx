"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";

interface Props {
  taskId: string;
  taskTitle: string;
  autoTrigger?: boolean;
}

export function DailySummary({ taskId, taskTitle, autoTrigger }: Props) {
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const triggered = useRef(false);

  const generateSummary = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setSummary("");

    try {
      const res = await fetch(`/api/tasks/${taskId}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: new Date().toISOString().slice(0, 10) }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "生成失败" }));
        throw new Error(data.error || `请求失败 (${res.status})`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setSummary((prev) => prev + chunk);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (autoTrigger && !triggered.current) {
      triggered.current = true;
      generateSummary();
    }
  }, [autoTrigger, generateSummary]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return (
    <div className="mt-6 pt-4 border-t border-border/30">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-muted-foreground">
          AI 每日总结
          {taskTitle && (
            <span className="text-muted-foreground/50 ml-1.5">· {taskTitle}</span>
          )}
        </p>
        <button
          onClick={generateSummary}
          disabled={loading}
          className="text-xs px-3 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "生成中..." : summary ? "重新生成" : "生成总结"}
        </button>
      </div>

      {error && <p className="text-xs text-danger mb-2">{error}</p>}

      {loading && !summary && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <div className="w-3 h-3 border border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          正在分析任务数据...
        </div>
      )}

      {summary && (
        <div className="prose-summary text-sm text-foreground/80">
          <ReactMarkdown>{summary}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
