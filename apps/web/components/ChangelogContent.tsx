"use client";

import { useEffect } from "react";
import { changelog, getLatestVersion } from "@/lib/changelog";

export function ChangelogContent() {
  useEffect(() => {
    localStorage.setItem("changelog_last_seen", getLatestVersion());
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">更新日志</h1>
      {changelog.map((entry) => (
        <div key={entry.version} className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-sage-mist text-sage">
              v{entry.version}
            </span>
            <span className="text-sm text-smoke">{entry.date}</span>
          </div>
          <h2 className="text-lg font-semibold">{entry.title}</h2>
          <ul className="space-y-1.5 text-sm text-foreground">
            {entry.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-sage mt-0.5 shrink-0">·</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
