"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PromptTemplate } from "@/lib/types";

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

interface CacheEntry {
  content: string;
  timestamp: number;
  date: string;
}

function getCacheKey(taskId: string, templateId: string) {
  return `ai-summary-${taskId}-${templateId}`;
}

function getCache(taskId: string, templateId: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(getCacheKey(taskId, templateId));
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    if (entry.date !== today) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) return null;
    return entry;
  } catch {
    return null;
  }
}

function setCache(taskId: string, templateId: string, content: string) {
  try {
    const entry: CacheEntry = {
      content,
      timestamp: Date.now(),
      date: new Date().toISOString().slice(0, 10),
    };
    localStorage.setItem(getCacheKey(taskId, templateId), JSON.stringify(entry));
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

interface Quota {
  used: number;
  limit: number;
  remaining: number;
}

interface Props {
  taskId: string;
  taskTitle: string;
  autoTrigger?: boolean;
  spaceId?: string;
  canConfigure?: boolean;
}

export function DailySummary({ taskId, taskTitle, autoTrigger, spaceId, canConfigure }: Props) {
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [serverLoading, setServerLoading] = useState(true);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState("default");
  const abortRef = useRef<AbortController | null>(null);
  const triggered = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Fetch templates on mount / spaceId change
  useEffect(() => {
    if (!spaceId) return;
    fetch(`/api/spaces/${spaceId}/summary-config`)
      .then((r) => r.json())
      .then((data) => {
        if (data.templates?.length) {
          setTemplates(data.templates);
        }
      })
      .catch(() => {});
  }, [spaceId]);

  const generateSummary = useCallback(async (templateId?: string) => {
    const tid = templateId ?? activeTemplateId;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setSummary("");
    setCachedAt(null);

    try {
      const res = await fetch(`/api/tasks/${taskId}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: new Date().toISOString().slice(0, 10),
          template_id: tid,
        }),
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

      setCache(taskId, tid, full);
      setCachedAt(Date.now());
      setQuota((prev) => prev ? { ...prev, used: prev.used + 1, remaining: Math.max(0, prev.remaining - 1) } : prev);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }, [taskId, activeTemplateId]);

  // Fetch server cache + quota on mount / taskId / activeTemplateId change
  useEffect(() => {
    triggered.current = false;
    setServerLoading(true);

    // Show localStorage cache immediately (fast flash)
    const localCached = getCache(taskId, activeTemplateId);
    if (localCached) {
      setSummary(localCached.content);
      setCachedAt(localCached.timestamp);
    } else {
      setSummary("");
      setCachedAt(null);
    }

    const today = new Date().toISOString().slice(0, 10);
    fetch(`/api/tasks/${taskId}/summary?date=${today}&template_id=${activeTemplateId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.quota) setQuota(data.quota);
        if (data.cached && data.content) {
          setSummary(data.content);
          const serverTime = new Date(data.generated_at).getTime();
          setCachedAt(serverTime);
          setCache(taskId, activeTemplateId, data.content);
          triggered.current = true;
        } else if (autoTrigger && !localCached && data.quota?.remaining > 0) {
          triggered.current = true;
          generateSummary(activeTemplateId);
        }
      })
      .catch(() => {
        // Fallback: if server unreachable and autoTrigger, try generating
        if (autoTrigger && !localCached) {
          triggered.current = true;
          generateSummary(activeTemplateId);
        }
      })
      .finally(() => setServerLoading(false));
  }, [taskId, activeTemplateId, autoTrigger, generateSummary]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function handleSaveAsNote() {
    if (saving || saved || !summary) return;
    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `AI 总结 · ${taskTitle} · ${today}`,
          description: summary,
          type: 1,
          space_id: spaceId,
          tags: ["AI总结"],
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
  const showTabs = templates.length > 1;

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-muted-foreground">
          AI 今日总结
          {taskTitle && (
            <span className="text-muted-foreground/50 ml-1.5">· {taskTitle}</span>
          )}
          {cachedAt && !loading && (
            <span className="text-muted-foreground/40 ml-1.5">· {formatTimeAgo(cachedAt)}</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {quota && (
            <span className="text-xs text-muted-foreground/50">
              {quota.remaining}/{quota.limit}
            </span>
          )}
          {canConfigure && spaceId && (
            <Link
              href={`/spaces/${spaceId}/summary-settings`}
              className="text-muted-foreground/50 hover:text-foreground transition-colors"
              title="AI 总结设置"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </Link>
          )}
          <button
            onClick={() => generateSummary()}
            disabled={loading || !canGenerate}
            className="text-xs px-3 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "生成中..." : summary ? "重新生成" : "生成总结"}
          </button>
          {summary && !loading && spaceId && (
            <button
              onClick={handleSaveAsNote}
              disabled={saving || saved}
              className="text-xs px-3 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saved ? "已保存" : saving ? "保存中..." : "转为笔记"}
            </button>
          )}
        </div>
      </div>

      {showTabs && (
        <div className="flex gap-3 mb-3 border-b border-border/30">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTemplateId(t.id)}
              className={`text-[11px] pb-1.5 border-b-2 transition-colors ${
                activeTemplateId === t.id
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-danger mb-2">{error}</p>}

      {loading && !summary && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <div className="w-3 h-3 border border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          正在分析任务数据...
        </div>
      )}

      {summary && (
        <div className="prose-summary text-sm text-foreground/80">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
        </div>
      )}

      {!loading && !summary && !error && serverLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <div className="w-3 h-3 border border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          加载中...
        </div>
      )}

      {!loading && !summary && !error && !serverLoading && !canGenerate && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">暂无 AI 总结</p>
          <p className="text-xs text-muted-foreground/60 mt-1">今日生成次数已用完</p>
        </div>
      )}
    </div>
  );
}
