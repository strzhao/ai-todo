"use client";

import { useState, useEffect } from "react";
import { fetchUrlMeta } from "@/lib/url-meta-cache";

// Match http/https URLs, strip trailing punctuation
const URL_REGEX = /(https?:\/\/[^\s<>"')\]]+?)(?=[.,;:!?)}\]]*(?:\s|$))/gi;

function getHostname(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const path = pathname.length > 1 ? pathname.slice(0, 20) + (pathname.length > 20 ? "..." : "") : "";
    return hostname + path;
  } catch {
    return url.slice(0, 30);
  }
}

function LinkChip({ url }: { url: string }) {
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchUrlMeta(url).then((meta) => {
      if (active && meta.title) setTitle(meta.title);
    });
    return () => { active = false; };
  }, [url]);

  const display = title || getHostname(url);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={title ? `${title}\n${url}` : url}
      className="inline-flex items-center gap-0.5 max-w-[240px] text-primary underline decoration-primary/30 hover:decoration-primary transition-colors cursor-pointer"
    >
      <span className="truncate">{display}</span>
      <svg
        viewBox="0 0 12 12"
        className="flex-shrink-0 w-3 h-3 opacity-50"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M3.5 1.5H1.5v9h9v-2M7 1.5h3.5V5M5 7l5.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

interface RichTextProps {
  text: string;
  truncate?: boolean;
  className?: string;
}

export function RichText({ text, truncate, className }: RichTextProps) {
  // Split text into segments: plain text and URLs
  const parts: Array<{ type: "text" | "url"; value: string }> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_REGEX)) {
    const url = match[1];
    const index = match.index!;
    if (index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, index) });
    }
    parts.push({ type: "url", value: url });
    lastIndex = index + url.length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  // No URLs found — render as plain text
  if (parts.length === 1 && parts[0].type === "text") {
    return <span className={`${truncate ? "truncate block" : "whitespace-pre-wrap break-words"} ${className ?? ""}`}>{text}</span>;
  }

  return (
    <span className={`${truncate ? "truncate block" : "whitespace-pre-wrap break-words"} ${className ?? ""}`}>
      {parts.map((part, i) =>
        part.type === "url" ? (
          <LinkChip key={i} url={part.value} />
        ) : (
          <span key={i}>{part.value}</span>
        )
      )}
    </span>
  );
}
