"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import type { Task } from "@/lib/types";
import { buildTree, type TaskNode } from "@/lib/task-utils";

interface SpaceTaskNode {
  id: string;
  title: string;
  subtasks: SpaceTaskNode[];
}

function toSpaceTaskNode(node: TaskNode): SpaceTaskNode {
  return {
    id: node.id,
    title: node.title,
    subtasks: node.subtasks.map(toSpaceTaskNode),
  };
}

interface Props {
  spaces: (Task & { name?: string })[];
  userEmail: string;
  isDev?: boolean;
}

export function SpaceNav({ spaces, userEmail, isDev }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [spaceTasks, setSpaceTasks] = useState<SpaceTaskNode[]>([]);
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Record<string, boolean>>({});
  const [openMenuSpaceId, setOpenMenuSpaceId] = useState<string | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  // Extract current space ID from pathname (e.g. /spaces/abc123 or /spaces/abc123/settings)
  const spaceMatch = pathname.match(/^\/spaces\/([^/]+)/);
  const currentSpaceId = spaceMatch?.[1];
  const isValidSpaceId = currentSpaceId && currentSpaceId !== "new";
  const focusedTaskId = searchParams.get("focus");

  useEffect(() => {
    if (!isValidSpaceId) {
      setSpaceTasks([]);
      setCollapsedTaskIds({});
      return;
    }
    fetch(`/api/tasks?space_id=${currentSpaceId}`)
      .then((r) => r.json())
      .then((data: Task[]) => {
        if (!Array.isArray(data)) {
          setSpaceTasks([]);
          setCollapsedTaskIds({});
          return;
        }
        const tree = buildTree(data);
        setSpaceTasks(tree.map(toSpaceTaskNode));
        setCollapsedTaskIds({});
      })
      .catch(() => {
        setSpaceTasks([]);
        setCollapsedTaskIds({});
      });
  }, [currentSpaceId, isValidSpaceId]);

  // Re-fetch space task tree when tasks are mutated elsewhere
  useEffect(() => {
    function onTasksChanged() {
      if (!isValidSpaceId) return;
      fetch(`/api/tasks?space_id=${currentSpaceId}`)
        .then((r) => r.json())
        .then((data: Task[]) => {
          if (Array.isArray(data)) {
            setSpaceTasks(buildTree(data).map(toSpaceTaskNode));
          }
        });
    }
    window.addEventListener("tasks-changed", onTasksChanged);
    return () => window.removeEventListener("tasks-changed", onTasksChanged);
  }, [currentSpaceId, isValidSpaceId]);

  function handleLogout() {
    window.location.href = "/api/auth/logout";
  }

  async function handleUnpin(spaceId: string) {
    await fetch(`/api/tasks/${spaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unpin" }),
    });
    router.refresh();
    window.dispatchEvent(new Event("tasks-changed"));
  }

  useEffect(() => {
    if (!accountMenuOpen) return;
    function handler(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!openMenuSpaceId) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuSpaceId(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenuSpaceId]);

  function isActive(path: string) {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  }

  const isTasksHome = pathname === "/" || pathname === "/all";

  const navLinkCls = (active: boolean) =>
    `flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
      active
        ? "bg-primary/10 text-primary font-medium"
        : "text-muted-foreground hover:text-foreground hover:bg-muted"
    }`;

  function toggleTaskCollapse(taskId: string) {
    setCollapsedTaskIds((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  }

  function renderSpaceTaskTree(spaceId: string, nodes: SpaceTaskNode[]) {
    return nodes.map((node) => {
      const hasChildren = node.subtasks.length > 0;
      const collapsed = Boolean(collapsedTaskIds[node.id]);
      const isFocused = focusedTaskId === node.id;

      return (
        <div key={node.id} className="space-y-0.5">
          <div className="flex items-center gap-1 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleTaskCollapse(node.id)}
                className="w-4 h-4 rounded text-[10px] leading-none flex items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground shrink-0"
                aria-label={collapsed ? "展开子任务" : "收起子任务"}
              >
                {collapsed ? "▶" : "▼"}
              </button>
            ) : (
              <span className="w-4 h-4 shrink-0" />
            )}
            <Link
              href={`/spaces/${spaceId}?focus=${node.id}`}
              className={`min-w-0 flex-1 py-1 px-2 rounded text-xs transition-colors ${
                isFocused
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <span className="truncate block">{node.title}</span>
            </Link>
          </div>
          {hasChildren && !collapsed && (
            <div className="ml-3 border-l border-border/40 pl-2 space-y-0.5">
              {renderSpaceTaskTree(spaceId, node.subtasks)}
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col w-52 min-h-screen border-r border-border/60 bg-background fixed left-0 top-0 pt-6 pb-4 px-3 z-10">
        <div className="flex items-center gap-2 px-3 mb-6">
          <span className="font-semibold text-base">AI Todo</span>
        </div>

        <div className="flex-1 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider px-3 mb-1">个人</p>
          <Link href="/" className={navLinkCls(isTasksHome)}>全部任务</Link>

          <div className="pt-4">
            <div className="flex items-center justify-between px-3 mb-1">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">项目空间</p>
              <Link href="/spaces/new" className="text-xs text-muted-foreground hover:text-foreground">+</Link>
            </div>
            {spaces.map((space) => (
              <div key={space.id}>
                <div className="group/space relative">
                  <Link
                    href={`/spaces/${space.id}`}
                    className={navLinkCls(isActive(`/spaces/${space.id}`))}
                  >
                    <span className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0">
                      {(space.name ?? space.title)[0]?.toUpperCase()}
                    </span>
                    <span className="truncate">{space.name ?? space.title}</span>
                    {(space.task_count ?? 0) > 0 && (
                      <span className="ml-auto text-[10px] text-muted-foreground group-hover/space:hidden">{space.task_count}</span>
                    )}
                  </Link>
                  <div
                    className="absolute right-1.5 top-1/2 -translate-y-1/2"
                    ref={openMenuSpaceId === space.id ? menuRef : undefined}
                  >
                    <button
                      onClick={(e) => { e.preventDefault(); setOpenMenuSpaceId(v => v === space.id ? null : space.id); }}
                      className="opacity-0 group-hover/space:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:bg-muted text-xs"
                      title="更多操作"
                    >
                      ⋯
                    </button>
                    {openMenuSpaceId === space.id && (
                      <div className="absolute right-0 top-full mt-0.5 z-50 bg-popover border border-border rounded-md shadow-md min-w-[100px] py-1">
                        <button
                          onClick={() => { setOpenMenuSpaceId(null); handleUnpin(space.id); }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/60"
                        >
                          取消置顶
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Task directory for current active space */}
                {currentSpaceId === space.id && spaceTasks.length > 0 && (
                  <div className="ml-5 mt-0.5 mb-1 border-l border-border/50 pl-2 space-y-0.5">
                    {renderSpaceTaskTree(space.id, spaceTasks)}
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
          <div className="group/account flex items-center gap-2 relative" ref={accountMenuRef}>
            <p className="text-xs text-muted-foreground truncate flex-1">{userEmail}</p>
            {isDev && (
              <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 shrink-0">
                DEV
              </span>
            )}
            <button
              onClick={() => setAccountMenuOpen((v) => !v)}
              className="opacity-0 group-hover/account:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:bg-muted text-xs shrink-0"
              title="更多操作"
            >
              ⋯
            </button>
            {accountMenuOpen && (
              <div className="absolute right-0 bottom-full mb-1 z-50 bg-popover border border-border rounded-md shadow-md min-w-[100px] py-1">
                <button
                  onClick={() => { setAccountMenuOpen(false); handleLogout(); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/60"
                >
                  退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border/60 z-10 flex">
        <Link href="/" className={`flex-1 flex flex-col items-center py-3 text-xs gap-1 ${isTasksHome ? "text-primary" : "text-muted-foreground"}`}>
          <span className="text-base">📋</span>任务
        </Link>
        <Link href="/spaces" className={`flex-1 flex flex-col items-center py-3 text-xs gap-1 ${pathname.startsWith("/spaces") ? "text-primary" : "text-muted-foreground"}`}>
          <span className="text-base">👥</span>空间
        </Link>
      </nav>
    </>
  );
}
