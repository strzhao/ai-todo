"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { aiFlowLog, createAiTraceId, summarizeParsedActions } from "@/lib/ai-flow-log";
import type { ParsedAction, ParsedTask, Task, SpaceMember } from "@/lib/types";

interface Props {
  onResult?: (actions: ParsedAction[], raw: string, traceId?: string) => void;
  onParsed?: (tasks: ParsedTask[], raw: string) => void;
  tasks?: Task[];
  spaceId?: string;
  members?: SpaceMember[];
  parentTaskId?: string;
  parentTaskTitle?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

export function NLInput({ onResult, onParsed, tasks, spaceId, members, parentTaskId, parentTaskTitle, value, onValueChange }: Props) {
  const [internalText, setInternalText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const text = value ?? internalText;

  function setTextValue(next: string) {
    if (onValueChange) onValueChange(next);
    if (value === undefined) setInternalText(next);
  }

  const activeMembers = members?.filter((m) => m.status === "active") ?? [];

  function getPlaceholder(): string {
    if (parentTaskTitle) {
      return `为「${parentTaskTitle}」添加子任务，或描述操作，支持 @成员`;
    }
    if (spaceId) {
      return '描述任务或操作，支持 @成员 指派，例如："@alice 明天 review API 文档"、"完成调研任务"';
    }
    return '描述任务或操作，例如："明天三点开会"、"完成写报告"、"把调研改成高优"';
  }

  const filteredMembers = mentionQuery !== null
    ? activeMembers.filter((m) => {
        const q = mentionQuery.toLowerCase();
        return m.email.toLowerCase().includes(q) || (m.display_name?.toLowerCase().includes(q) ?? false);
      })
    : [];

  async function parse() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError("");
    setMentionQuery(null);
    const traceId = createAiTraceId();

    try {
      const tasksCtx = tasks?.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
      })) ?? [];

      aiFlowLog("NLInput.parse.request", {
        trace_id: traceId,
        text,
        space_id: spaceId ?? null,
        parent_task: parentTaskId ? { id: parentTaskId, title: parentTaskTitle ?? "" } : null,
        tasks_ctx_count: tasksCtx.length,
        tasks_ctx: tasksCtx.map((t) => ({ id: t.id, title: t.title, status: t.status })),
        members_count: activeMembers.length,
      });

      const res = await fetch("/api/parse-task", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ai-trace-id": traceId },
        body: JSON.stringify({
          text,
          now: new Date().toISOString(),
          ...(spaceId ? { space_id: spaceId } : {}),
          ...(activeMembers.length > 0
            ? { members: activeMembers.map((m) => ({ email: m.email, display_name: m.display_name })) }
            : {}),
          ...(tasksCtx.length > 0 ? { tasks: tasksCtx } : {}),
          ...(parentTaskId ? { parent_task: { id: parentTaskId, title: parentTaskTitle ?? "" } } : {}),
        }),
      });

      if (!res.ok) {
        const d = await res.json() as { error?: string };
        aiFlowLog("NLInput.parse.failed", {
          trace_id: traceId,
          status: res.status,
          error: d.error ?? "解析失败",
        });
        setError(d.error || "解析失败");
        return;
      }

      const data = await res.json() as { actions?: ParsedAction[]; tasks?: unknown[] };
      // 兼容旧格式
      const actions: ParsedAction[] = data.actions ?? [{ type: "create", tasks: (data.tasks ?? []) as import("@/lib/types").ParsedTask[] }];
      aiFlowLog("NLInput.parse.response", {
        trace_id: traceId,
        actions_count: actions.length,
        actions: summarizeParsedActions(actions),
      });
      const createdTasks = actions.flatMap((a) => a.type === "create" ? (a.tasks ?? []) : []);
      if (onResult) onResult(actions, text, traceId);
      if (onParsed) onParsed(createdTasks, text);
    } catch (err) {
      aiFlowLog("NLInput.parse.error", {
        trace_id: traceId,
        error: err instanceof Error ? err.message : String(err),
      });
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      parse();
      return;
    }
    if (e.key === "Escape" && mentionQuery !== null) {
      e.preventDefault();
      setMentionQuery(null);
    }
  }

  function onTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setTextValue(val);
    setError("");

    if (activeMembers.length > 0) {
      const cursor = e.target.selectionStart ?? val.length;
      const textBeforeCursor = val.slice(0, cursor);
      const atMatch = textBeforeCursor.match(/@(\S*)$/);
      setMentionQuery(atMatch ? atMatch[1] : null);
    }
  }

  function insertMention(member: SpaceMember) {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? text.length;
    const before = text.slice(0, cursor);
    const after = text.slice(cursor);
    const atIdx = before.lastIndexOf("@");
    const newText = before.slice(0, atIdx) + `@${member.email} ` + after;
    setTextValue(newText);
    setMentionQuery(null);
    setTimeout(() => {
      const pos = atIdx + member.email.length + 2;
      el.setSelectionRange(pos, pos);
      el.focus();
    }, 0);
  }

  // Cmd+K global shortcut
  useEffect(() => {
    function handler(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div ref={containerRef} className="space-y-2 relative">
      <Textarea
        ref={textareaRef}
        placeholder={getPlaceholder()}
        value={text}
        onChange={onTextChange}
        onKeyDown={onKeyDown}
        className="min-h-[80px] resize-none text-base"
        disabled={loading}
      />

      {/* @mention dropdown */}
      {mentionQuery !== null && filteredMembers.length > 0 && (
        <div className="absolute z-50 bottom-full mb-1 left-0 w-72 bg-popover border border-border rounded-md shadow-md overflow-hidden">
          {filteredMembers.slice(0, 6).map((m) => (
            <button
              key={m.user_id}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent text-sm"
              onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
            >
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-medium flex-shrink-0">
                {(m.display_name || m.email)[0]?.toUpperCase()}
              </span>
              <span className="flex-1 min-w-0">
                {m.display_name && <span className="font-medium mr-1">{m.display_name}</span>}
                <span className="text-muted-foreground text-xs">{m.email}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-destructive">{error}</span>}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">⌘ + Enter</span>
          <Button onClick={parse} disabled={!text.trim() || loading} size="sm">
            {loading ? "解析中..." : "AI 解析"}
          </Button>
        </div>
      </div>
    </div>
  );
}
