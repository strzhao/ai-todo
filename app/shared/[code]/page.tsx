"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface SharedNote {
  title: string;
  description: string | null;
  tags: string[];
  created_at: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function SharedNotePage({ params }: { params: Promise<{ code: string }> }) {
  const [note, setNote] = useState<SharedNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    params.then(({ code }) => {
      fetch(`/api/notes/shared/${code}`)
        .then(async (r) => {
          if (!r.ok) throw new Error();
          return r.json() as Promise<SharedNote>;
        })
        .then(setNote)
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    });
  }, [params]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <p className="text-lg font-medium">笔记不存在</p>
          <p className="text-sm text-muted-foreground">该分享链接无效或已取消分享</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold leading-relaxed whitespace-pre-wrap">
            {note.title}
          </h1>
          <p className="text-xs text-muted-foreground mt-2">
            {formatDate(note.created_at)}
          </p>
        </div>

        {/* Description (Markdown) */}
        {note.description && (
          <div className="prose-summary text-sm leading-relaxed text-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.description}</ReactMarkdown>
          </div>
        )}

        {/* Tags */}
        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-6">
            {note.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-sage-mist text-sage"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-4 border-t border-border/60 text-center">
          <a
            href="https://ai-todo.stringzhao.life"
            className="text-xs text-muted-foreground hover:text-sage transition-colors"
          >
            AI Todo · ai-todo.stringzhao.life
          </a>
        </div>
      </div>
    </div>
  );
}
