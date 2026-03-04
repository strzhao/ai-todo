"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Space } from "@/lib/types";

interface SpaceTaskItem {
  id: string;
  title: string;
  subtask_count: number;
}

interface Props {
  spaces: Space[];
  userEmail: string;
}

export function SpaceNav({ spaces, userEmail }: Props) {
  const pathname = usePathname();
  const [spaceTasks, setSpaceTasks] = useState<SpaceTaskItem[]>([]);

  // Extract current space ID from pathname (e.g. /spaces/abc123 or /spaces/abc123/settings)
  const spaceMatch = pathname.match(/^\/spaces\/([^/]+)/);
  const currentSpaceId = spaceMatch?.[1];
  const isValidSpaceId = currentSpaceId && currentSpaceId !== "new";

  useEffect(() => {
    if (!isValidSpaceId) {
      setSpaceTasks([]);
      return;
    }
    fetch(`/api/tasks?space_id=${currentSpaceId}`)
      .then((r) => r.json())
      .then((data: { id: string; title: string; parent_id?: string }[]) => {
        if (!Array.isArray(data)) return;
        const topLevel = data.filter((t) => !t.parent_id);
        setSpaceTasks(
          topLevel.map((t) => ({
            id: t.id,
            title: t.title,
            subtask_count: data.filter((s) => s.parent_id === t.id).length,
          }))
        );
      })
      .catch(() => {});
  }, [currentSpaceId, isValidSpaceId]);

  function isActive(path: string) {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  }

  const navLinkCls = (active: boolean) =>
    `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
      active
        ? "bg-primary/10 text-primary font-medium"
        : "text-muted-foreground hover:text-foreground hover:bg-muted"
    }`;

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col w-52 min-h-screen border-r border-border/60 bg-background fixed left-0 top-0 pt-6 pb-4 px-3 z-10">
        <div className="flex items-center gap-2 px-3 mb-6">
          <span className="font-semibold text-base">AI Todo</span>
        </div>

        <div className="flex-1 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider px-3 mb-1">个人</p>
          <Link href="/" className={navLinkCls(isActive("/") && pathname === "/")}>今日任务</Link>
          <Link href="/all" className={navLinkCls(isActive("/all"))}>全部任务</Link>
          <Link href="/all?filter=assigned" className={navLinkCls(false)}>指派给我</Link>

          <div className="pt-4">
            <div className="flex items-center justify-between px-3 mb-1">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">项目空间</p>
              <Link href="/spaces/new" className="text-xs text-muted-foreground hover:text-foreground">+</Link>
            </div>
            {spaces.map((space) => (
              <div key={space.id}>
                <Link
                  href={`/spaces/${space.id}`}
                  className={navLinkCls(isActive(`/spaces/${space.id}`))}
                >
                  <span className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0">
                    {space.name[0]?.toUpperCase()}
                  </span>
                  <span className="truncate">{space.name}</span>
                  {(space.task_count ?? 0) > 0 && (
                    <span className="ml-auto text-[10px] text-muted-foreground">{space.task_count}</span>
                  )}
                </Link>

                {/* Task directory for current active space */}
                {currentSpaceId === space.id && spaceTasks.length > 0 && (
                  <div className="ml-5 mt-0.5 mb-1 border-l border-border/50 pl-2 max-h-48 overflow-y-auto space-y-0.5">
                    {spaceTasks.map((t) => (
                      <Link
                        key={t.id}
                        href={`/spaces/${space.id}?focus=${t.id}`}
                        className="flex items-center gap-1 py-1 px-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                      >
                        <span className="truncate flex-1">{t.title}</span>
                        {t.subtask_count > 0 && (
                          <span className="flex-shrink-0 text-[10px] text-muted-foreground/60 bg-muted rounded px-1">
                            {t.subtask_count}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {spaces.length === 0 && (
              <Link href="/spaces/new" className={navLinkCls(false)}>
                <span className="text-muted-foreground">+ 创建空间</span>
              </Link>
            )}
          </div>
        </div>

        <div className="px-3 pt-4 border-t border-border/60">
          <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border/60 z-10 flex">
        <Link href="/" className={`flex-1 flex flex-col items-center py-3 text-xs gap-1 ${pathname === "/" ? "text-primary" : "text-muted-foreground"}`}>
          <span className="text-base">☀️</span>今日
        </Link>
        <Link href="/all" className={`flex-1 flex flex-col items-center py-3 text-xs gap-1 ${pathname === "/all" ? "text-primary" : "text-muted-foreground"}`}>
          <span className="text-base">📋</span>全部
        </Link>
        <Link href="/spaces" className={`flex-1 flex flex-col items-center py-3 text-xs gap-1 ${pathname.startsWith("/spaces") ? "text-primary" : "text-muted-foreground"}`}>
          <span className="text-base">👥</span>空间
        </Link>
      </nav>
    </>
  );
}
