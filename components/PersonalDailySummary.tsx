"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

interface CacheEntry {
  content: string;
  timestamp: number;
  date: string;
}

interface Quota {
  used: number;
  limit: number;
  remaining: number;
}

function getCacheKey(date: string) {
  return `personal-summary-${date}`;
}

function getCache(date: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(getCacheKey(date));
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (entry.date !== date) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) return null;
    return entry;
  } catch {
    return null;
  }
}

function setCache(date: string, content: string) {
  try {
    const entry: CacheEntry = {
      content,
      timestamp: Date.now(),
      date,
    };
    localStorage.setItem(getCacheKey(date), JSON.stringify(entry));
  } catch {
    // ignore storage errors
  }
}

function formatTimeAgo(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "刚刚生成";
  if (minutes < 60) return `${minutes} 分钟前生成`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小时前生成`;
}

export function PersonalDailySummary() {
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Use local date to match user's timezone (avoid UTC midnight boundary issues)
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // Load cache + server state when expanded
  useEffect(() => {
    if (!expanded) return;

    setServerLoading(true);
    setError(null);

    // Show localStorage cache immediately
    const localCached = getCache(today);
    if (localCached) {
      setSummary(localCached.content);
      setCachedAt(localCached.timestamp);
    }

    fetch(`/api/me/summary?date=${today}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.quota) setQuota(data.quota);
        if (data.cached && data.content) {
          setSummary(data.content);
          const serverTime = new Date(data.generated_at).getTime();
          setCachedAt(serverTime);
          setCache(today, data.content);
        }
      })
      .catch(() => {})
      .finally(() => setServerLoading(false));
  }, [expanded, today]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const generateSummary = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setSummary("");
    setCachedAt(null);

    try {
      const res = await fetch("/api/me/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "生成失败" }));
        if (data.quota) setQuota(data.quota);
        throw new Error(data.error || `请求失败 (${res.status})`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        full += chunk;
        setSummary(full);
      }

      setCache(today, full);
      setCachedAt(Date.now());
      setQuota((prev) =>
        prev
          ? {
              ...prev,
              used: prev.used + 1,
              remaining: Math.max(0, prev.remaining - 1),
            }
          : prev
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }, [today]);

  async function handleSaveAsNote() {
    if (saving || saved || !summary) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `每日总结 - ${today}`,
          description: summary,
          type: 1,
          tags: ["每日总结"],
        }),
      });
      if (!res.ok) throw new Error("保存失败");
      setSaved(true);
      window.dispatchEvent(new Event("tasks-changed"));
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("保存笔记失败");
    } finally {
      setSaving(false);
    }
  }

  const canGenerate = !quota || quota.remaining > 0;

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left py-2"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${expanded ? "rotate-90" : ""}`}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
        个人每日总结
        {cachedAt && !loading && !expanded && (
          <span className="text-xs text-muted-foreground/40 font-normal ml-1">
            · {formatTimeAgo(cachedAt)}
          </span>
        )}
      </button>

      {expanded && (
        <div className="rounded-lg border border-border bg-background p-4 mt-1">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-muted-foreground">
              AI 每日总结
              {cachedAt && !loading && (
                <span className="text-muted-foreground/40 ml-1.5">
                  · {formatTimeAgo(cachedAt)}
                </span>
              )}
            </p>
            <div className="flex items-center gap-2">
              {quota && (
                <span className="text-xs text-muted-foreground/50">
                  {quota.remaining}/{quota.limit}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={generateSummary}
                disabled={loading || !canGenerate}
                className="text-xs h-7 px-3"
              >
                {loading
                  ? "生成中..."
                  : summary
                    ? "重新生成"
                    : "生成总结"}
              </Button>
              {summary && !loading && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveAsNote}
                  disabled={saving || saved}
                  className="text-xs h-7 px-3"
                >
                  {saved ? "已保存" : saving ? "保存中..." : "保存为笔记"}
                </Button>
              )}
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive mb-2">{error}</p>
          )}

          {loading && !summary && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
              <div className="w-3 h-3 border border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
              正在分析任务数据...
            </div>
          )}

          {summary && (
            <div className="prose-summary text-sm text-foreground/80">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {summary}
              </ReactMarkdown>
            </div>
          )}

          {!loading && !summary && !error && serverLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
              <div className="w-3 h-3 border border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
              加载中...
            </div>
          )}

          {!loading && !summary && !error && !serverLoading && (
            <p className="text-xs text-muted-foreground/60 py-2">
              {canGenerate
                ? "点击「生成总结」查看今日工作回顾"
                : "今日生成次数已用完"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
