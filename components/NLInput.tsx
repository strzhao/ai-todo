"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { ParsedTask } from "@/lib/types";

interface Props {
  onParsed: (result: ParsedTask, raw: string) => void;
}

export function NLInput({ onParsed }: Props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function parse() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/parse-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, now: new Date().toISOString() }),
      });

      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error || "解析失败");
        return;
      }

      const parsed = await res.json() as ParsedTask;
      onParsed(parsed, text);
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
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        ref={textareaRef}
        placeholder='用自然语言描述任务，例如："明天下午三点和客户开会，优先级高"'
        value={text}
        onChange={(e) => { setText(e.target.value); setError(""); }}
        onKeyDown={onKeyDown}
        className="min-h-[80px] resize-none text-base"
        disabled={loading}
      />
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
