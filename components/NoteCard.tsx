"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { extractTags } from "@/lib/note-utils";
import type { Task } from "@/lib/types";

interface Props {
  note: Task;
  highlight?: boolean;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onDelete: (id: string) => void;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function NoteCard({ note, highlight, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(note.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [needsCollapse, setNeedsCollapse] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.selectionStart = inputRef.current.value.length;
    }
  }, [editing]);

  useEffect(() => () => clearTimeout(deleteTimerRef.current), []);

  useEffect(() => {
    if (!editing && contentRef.current) {
      const height = contentRef.current.scrollHeight;
      setNeedsCollapse(height > 120);
    }
  }, [editing, note.title, note.description]);

  function handleSave() {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== note.title) {
      const newTags = extractTags(trimmed);
      fetch(`/api/tasks/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed, tags: newTags }),
      });
      onUpdate(note.id, { title: trimmed, tags: newTags });
    } else {
      setEditValue(note.title);
    }
    setEditing(false);
  }

  function handleDeleteClick() {
    if (confirmingDelete) {
      clearTimeout(deleteTimerRef.current);
      fetch(`/api/tasks/${note.id}`, { method: "DELETE" });
      onDelete(note.id);
    } else {
      setConfirmingDelete(true);
      deleteTimerRef.current = setTimeout(() => setConfirmingDelete(false), 3000);
    }
  }

  async function handleShare() {
    if (note.share_code || shareUrl) {
      // Already shared, copy full link
      const code = shareUrl ? new URL(shareUrl, window.location.origin).pathname.split("/").pop() : note.share_code;
      const url = `${window.location.origin}/shared/${code}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    setSharing(true);
    try {
      const res = await fetch(`/api/tasks/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "share" }),
      });
      if (res.ok) {
        const data = await res.json() as { share_code: string; share_url: string };
        const fullUrl = `${window.location.origin}/shared/${data.share_code}`;
        setShareUrl(fullUrl);
        onUpdate(note.id, { share_code: data.share_code });
        await navigator.clipboard.writeText(fullUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } finally {
      setSharing(false);
    }
  }

  async function handleUnshare() {
    const res = await fetch(`/api/tasks/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unshare" }),
    });
    if (res.ok) {
      setShareUrl("");
      onUpdate(note.id, { share_code: undefined });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      setEditValue(note.title);
      setEditing(false);
    }
  }

  const displayTitle = showRaw && note.voice_raw_text ? note.voice_raw_text : note.title;
  const authorName = note.creator_nickname || note.creator_email?.split("@")[0] || "";

  return (
    <div className={`group rounded-lg border border-border/60 bg-background p-3 hover:border-border transition-colors ${highlight ? "animate-highlight-sage" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {editing ? (
            <textarea
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              className="w-full text-sm bg-transparent border-none outline-none resize-none leading-relaxed"
              rows={Math.max(1, editValue.split("\n").length)}
            />
          ) : (
            <div>
              {/* Unified content area: title + description */}
              <div
                ref={contentRef}
                className={`relative ${!expanded && needsCollapse ? "max-h-[120px] overflow-hidden" : ""}`}
              >
                <div
                  className="prose-summary text-sm cursor-text"
                  onClick={() => setEditing(true)}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayTitle}</ReactMarkdown>
                </div>
                {note.description && (
                  <div className="prose-summary text-xs text-muted-foreground leading-relaxed mt-1.5">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.description}</ReactMarkdown>
                  </div>
                )}
                {/* Gradient mask when collapsed */}
                {!expanded && needsCollapse && (
                  <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none" />
                )}
              </div>
              {needsCollapse && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-[10px] text-sage mt-1 hover:underline"
                >
                  {expanded ? "收起" : "展开全部"}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Share button */}
          <button
            onClick={handleShare}
            disabled={sharing}
            className={`transition-opacity text-xs shrink-0 mt-0.5 px-1 ${
              sharing
                ? "opacity-100 text-muted-foreground animate-pulse"
                : note.share_code || shareUrl
                  ? "opacity-100 text-sage"
                  : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-sage"
            }`}
            title={sharing ? "生成中..." : note.share_code || shareUrl ? "已分享（点击复制链接）" : "分享"}
          >
            {sharing ? "..." : copied ? "已复制" : "\u2934"}
          </button>
          {/* Unshare button - only when shared */}
          {(note.share_code || shareUrl) && (
            <button
              onClick={handleUnshare}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-muted-foreground hover:text-destructive shrink-0 mt-0.5 px-1"
              title="取消分享"
            >
              {"\u2298"}
            </button>
          )}
          {/* Delete button */}
          <button
            onClick={handleDeleteClick}
            className={`transition-opacity text-xs shrink-0 mt-0.5 px-1 ${
              confirmingDelete
                ? "opacity-100 text-destructive font-medium"
                : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
            }`}
            title="删除"
          >
            {confirmingDelete ? "确认?" : "\u2715"}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 gap-2">
        <div className="flex flex-wrap gap-1 min-w-0">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-sage-mist text-sage"
            >
              #{tag}
            </span>
          ))}
        </div>
        {note.voice_raw_text && (
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="text-[10px] text-sage hover:underline shrink-0"
          >
            {showRaw ? "摘要" : "原文"}
          </button>
        )}
        <span className="text-[10px] text-muted-foreground shrink-0">
          {authorName ? `${authorName} \u00B7 ` : ""}{formatTime(note.created_at)}
        </span>
      </div>
    </div>
  );
}
