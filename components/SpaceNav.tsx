"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Space } from "@/lib/types";

interface Props {
  spaces: Space[];
  userEmail: string;
}

export function SpaceNav({ spaces, userEmail }: Props) {
  const pathname = usePathname();

  function isActive(path: string) {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  }

  const navLinkCls = (active: boolean) =>
    `flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
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

        <div className="flex-1 space-y-0.5">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider px-3 mb-1">个人</p>
          <Link href="/" className={navLinkCls(isActive("/") && pathname === "/")}>今日任务</Link>
          <Link href="/all" className={navLinkCls(isActive("/all"))}>全部任务</Link>
          <Link href="/all?filter=assigned" className={navLinkCls(pathname === "/all" && false)}>指派给我</Link>

          <div className="pt-4">
            <div className="flex items-center justify-between px-3 mb-1">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">项目空间</p>
              <Link href="/spaces/new" className="text-xs text-muted-foreground hover:text-foreground">+</Link>
            </div>
            {spaces.map((space) => (
              <Link
                key={space.id}
                href={`/spaces/${space.id}`}
                className={navLinkCls(isActive(`/spaces/${space.id}`))}
              >
                <span className="w-4 h-4 rounded bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary flex-shrink-0">
                  {space.name[0]?.toUpperCase()}
                </span>
                <span className="truncate">{space.name}</span>
                {(space.task_count ?? 0) > 0 && (
                  <span className="ml-auto text-[10px] text-muted-foreground">{space.task_count}</span>
                )}
              </Link>
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
