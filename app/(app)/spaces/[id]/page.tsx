"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NLInput } from "@/components/NLInput";
import { ParsePreviewCard } from "@/components/ParsePreviewCard";
import { TaskList } from "@/components/TaskList";
import type { ParsedTask, Task, Space, SpaceMember } from "@/lib/types";

interface SpacePageProps {
  params: Promise<{ id: string }>;
}

export default function SpacePage({ params }: SpacePageProps) {
  const [spaceId, setSpaceId] = useState<string>("");
  const [space, setSpace] = useState<Space | null>(null);
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [preview, setPreview] = useState<{ parsed: ParsedTask; raw: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterMember, setFilterMember] = useState<string>("all");

  useEffect(() => {
    params.then(({ id }) => {
      setSpaceId(id);
      Promise.all([
        fetch(`/api/spaces/${id}`).then((r) => r.json()),
        fetch(`/api/tasks?space_id=${id}`).then((r) => r.json()),
      ]).then(([spaceData, tasksData]: [{ space: Space; members: SpaceMember[] }, Task[]]) => {
        setSpace(spaceData.space);
        setMembers(spaceData.members);
        setTasks(tasksData);
      }).finally(() => setLoading(false));
    });
  }, [params]);

  function handleConfirm(task: Task) {
    setTasks((prev) => [task, ...prev]);
    setPreview(null);
  }

  function handleComplete(id: string) {
    const done = tasks.find((t) => t.id === id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (done) setCompletedTasks((prev) => [{ ...done, status: 2 as const }, ...prev].slice(0, 20));
  }

  function handleDelete(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function handleUpdate(id: string, updates: Partial<Task>) {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...updates } : t));
  }

  const activeMembers = members.filter((m) => m.status === "active");
  const filteredTasks = filterMember === "all"
    ? tasks
    : tasks.filter((t) => t.assignee_id === filterMember || t.user_id === filterMember);

  const completedCount = completedTasks.length;
  const totalCount = filteredTasks.length + completedCount;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-sm text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (!space) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-sm text-muted-foreground">空间不存在或你没有访问权限</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-semibold">{space.name}</h1>
        <Link href={`/spaces/${spaceId}/settings`} className="text-xs text-muted-foreground hover:text-foreground">
          设置
        </Link>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>任务进度</span>
            <span>{completedCount}/{totalCount} 已完成（{progressPct}%）</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Member filter */}
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
              {m.display_name || m.email.split("@")[0]}
            </button>
          ))}
        </div>
      )}

      <div className="mb-4">
        <NLInput
          onParsed={(p, r) => setPreview({ parsed: p, raw: r })}
          spaceId={spaceId}
          members={members}
        />
      </div>

      {preview && (
        <div className="mb-4">
          <ParsePreviewCard
            parsed={preview.parsed}
            onConfirm={handleConfirm}
            onCancel={() => setPreview(null)}
            spaceId={spaceId}
          />
        </div>
      )}

      <TaskList
        tasks={filteredTasks}
        completedTasks={completedTasks}
        loading={false}
        onComplete={handleComplete}
        onDelete={handleDelete}
        onUpdate={handleUpdate}
        emptyText="空间内暂无任务"
        emptySubtext="输入一句话创建空间任务，支持 @成员 指派"
      />
    </div>
  );
}
