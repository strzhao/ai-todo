"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { FileText } from "lucide-react";
import { useVoiceNote } from "@/lib/use-voice-note";
import { extractTags, groupNotesByDate } from "@/lib/note-utils";
import { NoteCard } from "@/components/NoteCard";
import { VoiceButton } from "@/components/VoiceButton";
import { TaskSkeleton } from "@/components/TaskSkeleton";
import { EmptyState } from "@/components/EmptyState";
import type { Task } from "@/lib/types";

interface SpaceNotesProps {
  spaceId: string;
}

export function SpaceNotes({ spaceId }: SpaceNotesProps) {
  const [notes, setNotes] = useState<Task[]>([]);
  const [inputText, setInputText] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [voiceRawText, setVoiceRawText] = useState<string | null>(null);

  const handleVoiceResult = useCallback((title: string, rawText: string, tags: string[]) => {
    const tagStr = tags.length ? ` ${tags.map((t) => `#${t}`).join(" ")}` : "";
    setInputText(title + tagStr);
    setVoiceRawText(rawText);
  }, []);

  const { voiceState, isTranscribing, isSupported: voiceSupported, duration, toggleListening } =
    useVoiceNote({ onResult: handleVoiceResult });

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [inputText]);

  const fetchNotes = useCallback(() => {
    setFetchError(false);
    setLoading(true);
    fetch(`/api/tasks?type=1&space_id=${spaceId}`)
      .then((r) => r.json())
      .then((data: Task[]) => {
        setNotes(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setNotes([]);
        setFetchError(true);
      })
      .finally(() => setLoading(false));
  }, [spaceId]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  useEffect(() => () => clearTimeout(highlightTimerRef.current), []);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach((n) => n.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [notes]);

  const filteredNotes = useMemo(() => {
    if (!selectedTag) return notes;
    return notes.filter((n) => n.tags.includes(selectedTag));
  }, [notes, selectedTag]);

  const groups = useMemo(() => groupNotesByDate(filteredNotes), [filteredNotes]);

  async function handleSubmit() {
    const title = inputText.trim();
    if (!title || saving) return;

    const tags = extractTags(title);
    setSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, tags, type: 1, space_id: spaceId, ...(voiceRawText ? { voice_raw_text: voiceRawText } : {}) }),
      });
      if (res.ok) {
        const note = await res.json() as Task;
        setNotes((prev) => [note, ...prev]);
        setInputText("");
        setVoiceRawText(null);
        setHighlightId(note.id);
        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = setTimeout(() => setHighlightId(null), 1000);
        window.dispatchEvent(new Event("tasks-changed"));
      }
    } finally {
      setSaving(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleUpdate(id: string, updates: Partial<Task>) {
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, ...updates } : n));
  }

  function handleDelete(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    window.dispatchEvent(new Event("tasks-changed"));
  }

  return (
    <>
      <div className="mb-4 space-y-2">
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="记一下想法、灵感、备忘... 用 #标签 分类"
          className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-base resize-none overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors placeholder:text-muted-foreground disabled:opacity-50"
          disabled={saving}
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{notes.length} 条笔记</span>
          {voiceSupported && (
            <VoiceButton
              voiceState={voiceState}
              isTranscribing={isTranscribing}
              duration={duration}
              disabled={saving}
              onClick={toggleListening}
            />
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden md:inline">⌘ + Enter</span>
            <button
              onClick={handleSubmit}
              disabled={!inputText.trim() || saving}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            onClick={() => setSelectedTag(null)}
            className={`px-2 py-1 rounded-full text-xs transition-colors ${
              !selectedTag ? "bg-sage text-white" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            全部
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`px-2 py-1 rounded-full text-xs transition-colors ${
                selectedTag === tag ? "bg-sage text-white" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <TaskSkeleton />
      ) : fetchError ? (
        <EmptyState text="加载失败" subtext="请检查网络后重试" action={{ label: "重试", onClick: fetchNotes }} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-10 h-10 text-muted-foreground" />}
          text="还没有笔记"
          subtext="输入内容后按 ⌘+Enter 保存，或通过 AI 输入框说「记一下...」"
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="text-xs text-muted-foreground font-medium mb-2 px-1">{group.label}</p>
              <div className="space-y-2">
                {group.notes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    highlight={note.id === highlightId}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
