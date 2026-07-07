"use client";

import { useState, type ReactNode } from "react";

interface ReadmeTabsProps {
  cliContent: ReactNode;
  docContent: ReactNode;
}

export function ReadmeTabs({ cliContent, docContent }: ReadmeTabsProps) {
  const [tab, setTab] = useState<"cli" | "doc">("cli");

  return (
    <div>
      <div className="flex gap-1 border-b mb-6">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "cli"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setTab("cli")}
        >
          CLI 工具 (AI)
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "doc"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setTab("doc")}
        >
          使用文档
        </button>
      </div>
      {tab === "cli" ? cliContent : docContent}
    </div>
  );
}
