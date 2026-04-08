"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { NLInput } from "@/components/NLInput";
import { ActionPreview } from "@/components/ActionPreview";
import { TaskList } from "@/components/TaskList";
import { TaskDetail } from "@/components/TaskDetail";
import { DailySummary } from "@/components/DailySummary";
import { SpaceSettings } from "@/components/SpaceSettings";
import { SpaceNotes } from "@/components/SpaceNotes";
import { Button } from "@/components/ui/button";
import { useTasks, useCompletedTasks, useGanttCompletedTasks, mutateTasks } from "@/lib/use-tasks";

const GanttLoading = () => (
  <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">加载甘特图...</div>
);
const PeopleGantt = dynamic(
  () => import("@/components/PeopleGantt").then((m) => ({ default: m.PeopleGantt })),
  { ssr: false, loading: GanttLoading }
);
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ParsedAction, Task, Space, SpaceMember, ActionResult } from "@/lib/types";
import { getDisplayLabel } from "@/lib/display-utils";
import { useIsDesktop } from "@/lib/use-media-query";
import { getWeekStartMonday, addDays } from "@/lib/gantt-utils";

// Build parent→children map once, then traverse O(n) instead of O(n²)
function buildChildMap(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.parent_id) {
      const arr = map.get(t.parent_id);
      if (arr) arr.push(t);
      else map.set(t.parent_id, [t]);
    }
  }
  return map;
}

function getDescendantsFromMap(map: Map<string, Task[]>, parentId: string): Task[] {
  const result: Task[] = [];
  const stack = [...(map.get(parentId) ?? [])];
  while (stack.length) {
    const t = stack.pop()!;
    result.push(t);
    const children = map.get(t.id);
    if (children) stack.push(...children);
  }
  return result;
}

interface SpacePageProps {
  params: Promise<{ id: string }>;
}

export default function SpacePage({ params }: SpacePageProps) {
  // --- All hooks at the top, before any conditional returns ---
  const [spaceId, setSpaceId] = useState<string>("");
  const [space, setSpace] = useState<Space | null>(null);
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const {
    data: rawTasks,
    isLoading: tasksLoading,
    mutate: mutateCurrent,
  } = useTasks(spaceId || undefined);
  const {
    data: rawCompleted,
    isLoading: completedLoading,
    mutate: mutateSpaceCompleted,
    hasMore: hasMoreCompleted,
    loadMore: loadMoreCompleted,
    isLoadingMore: isLoadingMoreCompleted,
  } = useCompletedTasks(spaceId || undefined);
  const [inputText, setInputText] = useState("");
  const [preview, setPreview] = useState<{
    actions: ParsedAction[];
    raw: string;
    traceId?: string;
  } | null>(null);
  const [spaceLoading, setSpaceLoading] = useState(true);
  const [filterMember, setFilterMember] = useState<string>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ganttSelectedTask, setGanttSelectedTask] = useState<Task | null>(null);
  const [spacePreview, setSpacePreview] = useState<{
    title: string;
    invite_mode: string;
    member_count: number;
  } | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [joinStatus, setJoinStatus] = useState<"idle" | "joining" | "joined" | "pending" | "error">(
    "idle"
  );
  const [fetchError, setFetchError] = useState(false);

  // Gantt date range state — tracks current week shown in PeopleGantt
  const [ganttDateRange, setGanttDateRange] = useState<{ from: string; to: string }>(() => {
    const ws = getWeekStartMonday(new Date(), 0);
    const toISO = (d: Date) => d.toISOString().slice(0, 10);
    return { from: toISO(ws), to: toISO(addDays(ws, 7)) };
  });
  const { data: ganttCompleted } = useGanttCompletedTasks(
    spaceId || undefined,
    ganttDateRange.from,
    ganttDateRange.to
  );

  const router = useRouter();
  const searchParams = useSearchParams();
  const focusedTaskId = searchParams.get("focus");
  const isDesktop = useIsDesktop();
  const handleGanttWeekChange = useCallback((from: string, to: string) => {
    setGanttDateRange({ from, to });
  }, []);

  const tasks = useMemo(() => rawTasks ?? [], [rawTasks]);
  const completedTasks = useMemo(
    () => (rawCompleted && Array.isArray(rawCompleted) ? rawCompleted : []),
    [rawCompleted]
  );
  const loading = spaceLoading || (tasksLoading && tasks.length === 0);

  const [tab, setTab] = useState<"list" | "gantt" | "summary" | "notes">(() => {
    const t = searchParams.get("tab");
    if (t === "gantt") return "gantt";
    if (t === "summary") return "summary";
    if (t === "notes") return "notes";
    return "list";
  });

  const switchTab = useCallback(
    (newTab: "list" | "gantt" | "summary" | "notes") => {
      setTab(newTab);
      const params = new URLSearchParams(searchParams.toString());
      if (newTab === "list") params.delete("tab");
      else params.set("tab", newTab);
      const qs = params.toString();
      router.replace(`/spaces/${spaceId}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, spaceId, router]
  );

  // Resolve params and fetch space info (not tasks — those come from SWR)
  useEffect(() => {
    params.then(({ id }) => {
      setSpaceId(id);
      fetch(`/api/spaces/${id}`)
        .then(async (r) => {
          if (r.status === 403) {
            const data = await r.json();
            if (data.space_preview) {
              setSpacePreview(data.space_preview);
              setIsPending(!!data.pending);
            }
            return null;
          }
          if (!r.ok) {
            setFetchError(true);
            return null;
          }
          return r.json() as Promise<{ space: Space; members: SpaceMember[] }>;
        })
        .then((spaceData) => {
          if (spaceData) {
            setSpace(spaceData.space);
            setMembers(spaceData.members);
          }
        })
        .finally(() => setSpaceLoading(false));
    });
  }, [params]);

  // Listen for tasks-changed events to trigger SWR revalidation
  useEffect(() => {
    const handler = () => mutateTasks();
    window.addEventListener("tasks-changed", handler);
    return () => window.removeEventListener("tasks-changed", handler);
  }, []);

  function handleActionDone(result: ActionResult) {
    const hasSuccess = Boolean(
      result.created?.length ||
      result.updated?.length ||
      result.completed?.length ||
      result.deleted?.length ||
      result.logged?.length
    );
    if (hasSuccess) {
      setInputText("");
      mutateTasks();
      window.dispatchEvent(new Event("tasks-changed"));
    }
    setPreview(null);
  }

  function handleComplete(id: string) {
    mutateCurrent((prev) => prev?.filter((t) => t.id !== id), { revalidate: true });
    const done = rawTasks?.find((t) => t.id === id);
    if (done) {
      mutateSpaceCompleted(
        (prev) => [{ ...done, status: 2 as const }, ...(prev ?? [])].slice(0, 20),
        { revalidate: true }
      );
    }
    window.dispatchEvent(new Event("tasks-changed"));
  }

  function handleDelete(id: string) {
    mutateCurrent((prev) => prev?.filter((t) => t.id !== id), { revalidate: true });
    window.dispatchEvent(new Event("tasks-changed"));
  }

  function handleReopen(id: string) {
    const reopened = rawCompleted?.find((t) => t.id === id);
    mutateSpaceCompleted((prev) => prev?.filter((t) => t.id !== id), { revalidate: true });
    if (reopened) {
      mutateCurrent(
        (prev) => [...(prev ?? []), { ...reopened, status: 0 as const, completed_at: undefined }],
        { revalidate: true }
      );
    }
    window.dispatchEvent(new Event("tasks-changed"));
  }

  function handleUpdate(id: string, updates: Partial<Task>) {
    mutateCurrent((prev) => prev?.map((t) => (t.id === id ? { ...t, ...updates } : t)), {
      revalidate: true,
    });
  }

  const handleGanttTaskClick = useCallback(
    (id: string) => {
      const task = tasks.find((t) => t.id === id) ?? completedTasks.find((t) => t.id === id);
      if (task) setGanttSelectedTask(task);
    },
    [tasks, completedTasks]
  );

  const activeMembers = useMemo(() => members.filter((m) => m.status === "active"), [members]);
  const filteredTasks = useMemo(
    () =>
      filterMember === "all"
        ? tasks
        : tasks.filter((t) => t.assignee_id === filterMember || t.user_id === filterMember),
    [tasks, filterMember]
  );

  const focusedTask = useMemo(
    () => (focusedTaskId ? (tasks.find((t) => t.id === focusedTaskId) ?? null) : null),
    [tasks, focusedTaskId]
  );

  // Ancestor IDs for auto-expanding tree path to focused task (desktop)
  const focusAncestorIds = useMemo(() => {
    if (!focusedTaskId) return undefined;
    const ids = new Set<string>();
    let currentId = focusedTaskId;
    while (currentId) {
      const t = tasks.find((t) => t.id === currentId);
      if (!t?.parent_id) break;
      ids.add(t.parent_id);
      currentId = t.parent_id;
    }
    return ids.size > 0 ? ids : undefined;
  }, [focusedTaskId, tasks]);

  // Current focus layer (for AI parse + action resolution): only direct children, unfinished
  const focusLayerTasks = useMemo(
    () =>
      focusedTaskId
        ? tasks.filter((t) => t.parent_id === focusedTaskId)
        : tasks.filter((t) => !t.parent_id),
    [tasks, focusedTaskId]
  );

  // Add current container node (space root or focused parent) for expressions like "在 X 下新增..."
  const aiContextTasks = useMemo<Task[]>(
    () =>
      focusedTaskId
        ? focusedTask
          ? [focusedTask, ...focusLayerTasks]
          : focusLayerTasks
        : space
          ? [space, ...focusLayerTasks]
          : focusLayerTasks,
    [focusedTaskId, focusedTask, focusLayerTasks, space]
  );

  // Drill-down: each level only shows direct children, not all descendants
  const displayTasks = useMemo(
    () =>
      focusedTaskId
        ? filteredTasks.filter((t) => t.parent_id === focusedTaskId)
        : filteredTasks.filter(
            (t) => t.parent_id === spaceId || (t.space_id === spaceId && !t.parent_id)
          ),
    [filteredTasks, focusedTaskId, spaceId]
  );

  // Completed tasks scoped to current level only
  const focusedCompletedTasks = useMemo(
    () =>
      focusedTaskId
        ? completedTasks.filter((t) => t.parent_id === focusedTaskId)
        : completedTasks.filter(
            (t) => t.parent_id === spaceId || (t.space_id === spaceId && !t.parent_id)
          ),
    [completedTasks, focusedTaskId, spaceId]
  );

  // Pre-build parent→children maps for O(n) descendant lookups
  const filteredChildMap = useMemo(() => buildChildMap(filteredTasks), [filteredTasks]);
  const completedChildMap = useMemo(() => buildChildMap(completedTasks), [completedTasks]);

  // Progress stats use all descendants for accurate overall completion rate
  const { allDescendants, allCompletedDescendants, completedCount, totalCount, progressPct } =
    useMemo(() => {
      const desc = focusedTaskId
        ? getDescendantsFromMap(filteredChildMap, focusedTaskId)
        : filteredTasks;
      const compDesc = focusedTaskId
        ? getDescendantsFromMap(completedChildMap, focusedTaskId)
        : completedTasks;
      const cc = compDesc.length;
      const tc = desc.length + cc;
      return {
        allDescendants: desc,
        allCompletedDescendants: compDesc,
        completedCount: cc,
        totalCount: tc,
        progressPct: tc > 0 ? Math.round((cc / tc) * 100) : 0,
      };
    }, [focusedTaskId, filteredChildMap, completedChildMap, filteredTasks, completedTasks]);

  const ganttTasks = useMemo(() => {
    if (focusedTaskId) {
      return [...allDescendants, ...allCompletedDescendants];
    }
    const ganttCompletedList = ganttCompleted ?? completedTasks;
    return [...tasks, ...ganttCompletedList];
  }, [
    focusedTaskId,
    allDescendants,
    allCompletedDescendants,
    tasks,
    completedTasks,
    ganttCompleted,
  ]);

  // Child count map for drill-down: tells TaskItem how many children each task has
  const childCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of tasks) {
      if (t.parent_id) map[t.parent_id] = (map[t.parent_id] ?? 0) + 1;
    }
    return map;
  }, [tasks]);

  if (loading) {
    return (
      <div className="app-content">
        <div className="text-sm text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (!space) {
    if (spacePreview) {
      const handleJoin = async () => {
        setJoinStatus("joining");
        try {
          const res = await fetch(`/api/spaces/${spaceId}/join`, { method: "POST" });
          if (!res.ok) {
            setJoinStatus("error");
            return;
          }
          const data = (await res.json()) as { space_id: string; status: string };
          if (data.status === "active") {
            setJoinStatus("joined");
            setTimeout(() => window.location.reload(), 1500);
          } else {
            setJoinStatus("pending");
            setIsPending(true);
          }
        } catch {
          setJoinStatus("error");
        }
      };

      return (
        <div className="app-content">
          <div className="max-w-sm mx-auto py-12">
            <div className="border border-border rounded-xl p-6 space-y-5">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-sage-mist flex items-center justify-center text-sage font-bold text-2xl mx-auto mb-3">
                  {spacePreview.title[0]?.toUpperCase()}
                </div>
                <h2 className="text-lg font-semibold">{spacePreview.title}</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {spacePreview.member_count} 名成员
                </p>
              </div>

              {isPending || joinStatus === "pending" ? (
                <div className="text-center space-y-2">
                  <p className="text-sm font-medium">申请已提交</p>
                  <p className="text-xs text-muted-foreground">等待管理员审批后即可访问空间</p>
                </div>
              ) : joinStatus === "joined" ? (
                <div className="text-center text-sm text-sage">加入成功！正在刷新...</div>
              ) : joinStatus === "error" ? (
                <div className="text-center space-y-2">
                  <p className="text-xs text-destructive">加入失败，请重试</p>
                  <Button variant="outline" size="sm" onClick={() => setJoinStatus("idle")}>
                    重试
                  </Button>
                </div>
              ) : (
                <>
                  {spacePreview.invite_mode === "approval" && (
                    <p className="text-xs text-center text-muted-foreground">
                      此空间需要管理员审批才能加入
                    </p>
                  )}
                  <Button
                    className="w-full"
                    onClick={handleJoin}
                    disabled={joinStatus === "joining"}
                  >
                    {joinStatus === "joining"
                      ? "加入中..."
                      : spacePreview.invite_mode === "approval"
                        ? "申请加入"
                        : "加入空间"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="app-content">
        <p className="text-sm text-muted-foreground">
          {fetchError ? "加载失败，请刷新重试" : "空间不存在或你没有访问权限"}
        </p>
      </div>
    );
  }

  return (
    <div className={tab === "gantt" ? "app-content-wide" : "app-content"}>
      <div className="flex items-center justify-between mb-4">
        {focusedTask ? (
          <h1 className="text-xl font-semibold flex items-center gap-1.5 min-w-0">
            <button
              onClick={() => router.push(`/spaces/${spaceId}`)}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              {space.title}
            </button>
            {(() => {
              // Build ancestor chain from focusedTask up to root
              const ancestors: Task[] = [];
              let current = focusedTask;
              while (current.parent_id) {
                const parent = tasks.find((t) => t.id === current.parent_id);
                if (!parent) break;
                ancestors.unshift(parent);
                current = parent;
              }
              return (
                <>
                  {ancestors.map((ancestor) => (
                    <span key={ancestor.id} className="flex items-center gap-1.5 shrink-0">
                      <span className="text-muted-foreground/50">›</span>
                      <button
                        onClick={() => router.push(`/spaces/${spaceId}?focus=${ancestor.id}`)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {ancestor.title}
                      </button>
                    </span>
                  ))}
                  <span className="text-muted-foreground/50 shrink-0">›</span>
                  <span className="truncate">{focusedTask.title}</span>
                </>
              );
            })()}
          </h1>
        ) : (
          <h1 className="text-xl font-semibold">{space.title}</h1>
        )}
        <button
          onClick={() => setSettingsOpen(true)}
          className="text-xs text-muted-foreground hover:text-foreground shrink-0 ml-2"
        >
          设置
        </button>
      </div>

      {totalCount > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>任务进度</span>
            <span>
              {completedCount}/{totalCount} 已完成（{progressPct}%）
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex gap-1 mb-4">
        <button
          onClick={() => switchTab("list")}
          className={`text-xs px-3 py-1 rounded-md border transition-colors ${tab === "list" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground"}`}
        >
          任务列表
        </button>
        <button
          onClick={() => switchTab("gantt")}
          className={`text-xs px-3 py-1 rounded-md border transition-colors ${tab === "gantt" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground"}`}
        >
          甘特图
        </button>
        <button
          onClick={() => switchTab("summary")}
          className={`text-xs px-3 py-1 rounded-md border transition-colors ${tab === "summary" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground"}`}
        >
          AI 总结
        </button>
        <button
          onClick={() => switchTab("notes")}
          className={`text-xs px-3 py-1 rounded-md border transition-colors ${tab === "notes" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground"}`}
        >
          笔记
        </button>
      </div>

      {tab === "list" && (
        <>
          {activeMembers.length > 1 && (
            <div className="flex gap-1.5 mb-4 flex-wrap">
              <button
                onClick={() => setFilterMember("all")}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterMember === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground"}`}
              >
                全部
              </button>
              {activeMembers.map((m) => (
                <button
                  key={m.user_id}
                  onClick={() => setFilterMember(m.user_id)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterMember === m.user_id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground"}`}
                >
                  {getDisplayLabel(m.email, m)}
                </button>
              ))}
            </div>
          )}

          <div className="mb-4">
            <NLInput
              onResult={(actions, r, traceId) => setPreview({ actions, raw: r, traceId })}
              tasks={aiContextTasks}
              spaceId={spaceId}
              members={members}
              parentTaskId={focusedTaskId ?? undefined}
              parentTaskTitle={focusedTask?.title}
              value={inputText}
              onValueChange={setInputText}
            />
          </div>

          {preview && (
            <div className="mb-4">
              <ActionPreview
                actions={preview.actions}
                raw={preview.raw}
                allTasks={space ? [space, ...tasks] : tasks}
                spaceId={spaceId}
                members={members}
                parentTaskId={focusedTaskId ?? undefined}
                traceId={preview.traceId}
                onDone={handleActionDone}
                onCancel={() => setPreview(null)}
              />
            </div>
          )}

          <TaskList
            tasks={focusedTaskId ? displayTasks : isDesktop ? filteredTasks : displayTasks}
            completedTasks={
              focusedTaskId
                ? focusedCompletedTasks
                : isDesktop
                  ? completedTasks
                  : focusedCompletedTasks
            }
            loading={false}
            onComplete={handleComplete}
            onDelete={handleDelete}
            onUpdate={handleUpdate}
            onReopen={handleReopen}
            emptyText={focusedTaskId ? "该任务暂无子任务" : "空间内暂无任务"}
            emptySubtext={
              focusedTaskId
                ? "通过 AI 输入框为该任务添加子任务"
                : "输入一句话创建空间任务，支持 @成员 指派"
            }
            members={members}
            onDrillDown={
              focusedTaskId || !isDesktop
                ? (taskId) => router.push(`/spaces/${spaceId}?focus=${taskId}`)
                : undefined
            }
            childCountMap={focusedTaskId || !isDesktop ? childCountMap : undefined}
            hasMoreCompleted={hasMoreCompleted}
            onLoadMore={loadMoreCompleted}
            isLoadingMore={isLoadingMoreCompleted}
          />
        </>
      )}

      {tab === "gantt" && (
        <>
          <PeopleGantt
            tasks={ganttTasks}
            members={members}
            onTaskClick={handleGanttTaskClick}
            onWeekChange={handleGanttWeekChange}
          />
        </>
      )}

      {tab === "summary" && (
        <DailySummary
          taskId={focusedTaskId ?? spaceId}
          taskTitle={focusedTask?.title ?? space?.title ?? ""}
          autoTrigger
          spaceId={spaceId}
          canConfigure={space?.my_role === "owner" || space?.my_role === "admin"}
        />
      )}

      {tab === "notes" && <SpaceNotes spaceId={spaceId} />}

      <Sheet
        open={!!ganttSelectedTask}
        onOpenChange={(open) => {
          if (!open) setGanttSelectedTask(null);
        }}
      >
        <SheetContent>
          <SheetHeader className="sr-only">
            <SheetTitle>{ganttSelectedTask?.title ?? "任务详情"}</SheetTitle>
          </SheetHeader>
          {ganttSelectedTask && (
            <div className="flex-1 overflow-y-auto">
              <TaskDetail
                task={ganttSelectedTask}
                members={members}
                mode="standalone"
                readonly={ganttSelectedTask.status === 2}
                onUpdate={(id, updates) => {
                  handleUpdate(id, updates);
                  setGanttSelectedTask((prev) =>
                    prev?.id === id ? { ...prev, ...updates } : prev
                  );
                }}
                onComplete={(id) => {
                  handleComplete(id);
                  setGanttSelectedTask(null);
                }}
                onDelete={(id) => {
                  handleDelete(id);
                  setGanttSelectedTask(null);
                }}
              />
              {(childCountMap[ganttSelectedTask.id] ?? 0) > 0 && (
                <div className="px-4 pb-4">
                  <button
                    onClick={() => {
                      const taskId = ganttSelectedTask.id;
                      setGanttSelectedTask(null);
                      router.push(`/spaces/${spaceId}?focus=${taskId}`);
                    }}
                    className="text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                  >
                    查看子任务 ({childCountMap[ganttSelectedTask.id]})
                  </button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{space.title} · 设置</SheetTitle>
          </SheetHeader>
          <SpaceSettings
            spaceId={spaceId}
            onArchived={() => {
              setSettingsOpen(false);
              router.push("/spaces");
            }}
            onDissolved={() => {
              setSettingsOpen(false);
              router.push("/spaces");
            }}
            onLeft={() => {
              setSettingsOpen(false);
              router.push("/spaces");
              router.refresh();
            }}
            onNameChanged={(newName) => {
              setSpace((prev) => (prev ? { ...prev, title: newName } : prev));
              window.dispatchEvent(new Event("tasks-changed"));
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
