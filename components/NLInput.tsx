"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { ParsedTask, SpaceMember } from "@/lib/types";

interface Props {
  onParsed: (results: ParsedTask[], raw: string) => void;
  spaceId?: string;
  members?: SpaceMember[];
}

export function NLInput({ onParsed, spaceId, members }: Props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeMembers = members?.filter((m) => m.status === "active") ?? [];

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

    try {
      const res = await fetch("/api/parse-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          now: new Date().toISOString(),
          ...(spaceId ? { space_id: spaceId } : {}),
          ...(activeMembers.length > 0
            ? { members: activeMembers.map((m) => ({ email: m.email, display_name: m.display_name })) }
            : {}),
        }),
      });

      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error || "解析失败");
        return;
      }

      const data = await res.json() as { tasks: ParsedTask[] };
      onParsed(data.tasks, text);
      setText("");
    } catch {
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
    setText(val);
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
    setText(newText);
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
        placeholder={
          spaceId
            ? '用自然语言描述任务，支持 @成员 指派，例如："@alice 明天下午 review API 文档，高优"'
            : '用自然语言描述任务，例如："明天下午三点和客户开会，优先级高"'
        }
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
        <Button onClick={parse} disabled={!text.trim() || loading} size="sm">
          {loading ? "解析中..." : "AI 解析"}
        </Button>
        <span className="text-xs text-muted-foreground">⌘ + Enter</span>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}
