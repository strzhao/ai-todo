"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { NLInput } from "@/components/NLInput";
import { ActionPreview } from "@/components/ActionPreview";
import { TaskList } from "@/components/TaskList";
import { GanttChart } from "@/components/GanttChart";
import { DailySummary } from "@/components/DailySummary";
import type { ParsedAction, Task, Space, SpaceMember, ActionResult } from "@/lib/types";
import { getDisplayLabel } from "@/lib/display-utils";

// Recursively collect all descendants of a given parent
function getDescendants(tasks: Task[], parentId: string): Task[] {
  const direct = tasks.filter((t) => t.parent_id === parentId);
  return direct.flatMap((t) => [t, ...getDescendants(tasks, t.id)]);
}

interface SpacePageProps {
  params: Promise<{ id: string }>;
}

export default function SpacePage({ params }: SpacePageProps) {
  const [spaceId, setSpaceId] = useState<string>("");
  const [space, setSpace] = useState<Space | null>(null);
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [inputText, setInputText] = useState("");
  const [preview, setPreview] = useState<{ actions: ParsedAction[]; raw: string; traceId?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterMember, setFilterMember] = useState<string>("all");

  const router = useRouter();
  const searchParams = useSearchParams();
  const focusedTaskId = searchParams.get("focus");

  const [tab, setTab] = useState<"list" | "gantt" | "summary">(() => {
    const t = searchParams.get("tab");
    if (t === "gantt") return "gantt";
    if (t === "summary") return "summary";
    return "list";
  });

  useEffect(() => {
    params.then(({ id }) => {
      setSpaceId(id);
      Promise.all([
        fetch(`/api/spaces/${id}`).then((r) => r.json()),
        fetch(`/api/tasks?space_id=${id}`).then((r) => r.json()),
        fetch(`/api/tasks?space_id=${id}&filter=completed`).then((r) => r.json()).catch(() => []),
      ]).then(([spaceData, tasksData, completedData]: [{ space: Space; members: SpaceMember[] }, Task[], Task[]]) => {
        setSpace(spaceData.space);
        setMembers(spaceData.members);
        setTasks(tasksData);
        setCompletedTasks(Array.isArray(completedData) ? completedData : []);
      }).finally(() => setLoading(false));
    });
  }, [params]);

  function handleActionDone(result: ActionResult) {
    if (result.created?.length) setTasks((prev) => [...result.created!, ...prev]);
    if (result.updated?.length) setTasks((prev) => prev.map((t) => result.updated!.find((u) => u.id === t.id) ?? t));
    if (result.completed?.length) {
      for (const id of result.completed) {
        const done = tasks.find((t) => t.id === id);
        setTasks((prev) => prev.filter((t) => t.id !== id && t.parent_id !== id));
        if (done) setCompletedTasks((prev) => [{ ...done, status: 2 as const }, ...prev].slice(0, 20));
      }
    }
    if (result.deleted?.length) {
      setTasks((prev) => prev.filter((t) => !result.deleted!.includes(t.id) && !result.deleted!.includes(t.parent_id ?? "")));
    }
    const hasSuccess = Boolean(
      result.created?.length ||
      result.updated?.length ||
      result.completed?.length ||
      result.deleted?.length ||
      result.logged?.length
    );
    if (hasSuccess) {
      setInputText("");
      window.dispatchEvent(new Event("tasks-changed"));
    }
    setPreview(null);
  }

  function handleComplete(id: string) {
    const done = tasks.find((t) => t.id === id);
    setTasks((prev) => prev.filter((t) => t.id !== id && t.parent_id !== id));
    if (done) setCompletedTasks((prev) => [{ ...done, status: 2 as const }, ...prev].slice(0, 20));
    window.dispatchEvent(new Event("tasks-changed"));
  }

  function handleDelete(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id && t.parent_id !== id));
    window.dispatchEvent(new Event("tasks-changed"));
  }

  function handleUpdate(id: string, updates: Partial<Task>) {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...updates } : t));
  }

  function handleGanttTaskClick(id: string) {
    setTab("list");
    setTimeout(() => {
      const el = document.getElementById(`task-${id}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }

  const activeMembers = members.filter((m) => m.status === "active");
  const filteredTasks = filterMember === "all"
    ? tasks
    : tasks.filter((t) => t.assignee_id === filterMember || t.user_id === filterMember);

  const focusedTask = focusedTaskId ? tasks.find((t) => t.id === focusedTaskId) : null;

  // Current focus layer (for AI parse + action resolution): only direct children, unfinished
  const focusLayerTasks = focusedTaskId
    ? tasks.filter((t) => t.parent_id === focusedTaskId)
    : tasks.filter((t) => !t.parent_id);

  // Add current container node (space root or focused parent) for expressions like "在 X 下新增..."
  const aiContextTasks: Task[] = focusedTaskId
    ? (focusedTask ? [focusedTask, ...focusLayerTasks] : focusLayerTasks)
    : (space ? [space, ...focusLayerTasks] : focusLayerTasks);

  // When a task is focused, show all descendants (not just direct children)
  const displayTasks = focusedTaskId
    ? getDescendants(filteredTasks, focusedTaskId)
    : filteredTasks;

  // Completed tasks scoped to focus context (include all descendants)
  const focusedCompletedTasks = focusedTaskId
    ? getDescendants(completedTasks, focusedTaskId)
    : completedTasks;

  const completedCount = focusedCompletedTasks.length;
  const totalCount = displayTasks.length + completedCount;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const ganttTasks = focusedTaskId
    ? [...displayTasks, ...focusedCompletedTasks]
    : [...tasks, ...completedTasks];

  if (loading) {
    return (
      <div className="app-content">
        <div className="text-sm text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (!space) {
    return (
      <div className="app-content">
        <p className="text-sm text-muted-foreground">空间不存在或你没有访问权限</p>
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
        <Link href={`/spaces/${spaceId}/settings`} className="text-xs text-muted-foreground hover:text-foreground shrink-0 ml-2">
          设置
        </Link>
      </div>

      {totalCount > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>任务进度</span>
            <span>{completedCount}/{totalCount} 已完成（{progressPct}%）</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      <div className="flex gap-1 mb-4">
        <button
          onClick={() => setTab("list")}
          className={`text-xs px-3 py-1 rounded-md border transition-colors ${tab === "list" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground"}`}
        >
          任务列表
        </button>
        <button
          onClick={() => setTab("gantt")}
          className={`text-xs px-3 py-1 rounded-md border transition-colors ${tab === "gantt" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground"}`}
        >
          甘特图
        </button>
        <button
          onClick={() => setTab("summary")}
          className={`text-xs px-3 py-1 rounded-md border transition-colors ${tab === "summary" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground"}`}
        >
          AI 总结
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
                allTasks={tasks}
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
            tasks={displayTasks}
            completedTasks={focusedCompletedTasks}
            loading={false}
            onComplete={handleComplete}
            onDelete={handleDelete}
            onUpdate={handleUpdate}
            emptyText={focusedTaskId ? "该任务暂无子任务" : "空间内暂无任务"}
            emptySubtext={focusedTaskId ? "通过 AI 输入框为该任务添加子任务" : "输入一句话创建空间任务，支持 @成员 指派"}
            members={members}
          />
        </>
      )}

      {tab === "gantt" && (
        <GanttChart tasks={ganttTasks} members={members} onTaskClick={handleGanttTaskClick} />
      )}

      {tab === "summary" && (
        <DailySummary
          taskId={focusedTaskId ?? spaceId}
          taskTitle={focusedTask?.title ?? space?.title ?? ""}
          autoTrigger
          canTrigger={space?.my_role === "owner" || space?.my_role === "admin"}
        />
      )}
    </div>
  );
}
