"use client";

import { useState } from "react";
import { TaskItem } from "./TaskItem";
import { TaskSkeleton } from "./TaskSkeleton";
import { EmptyState } from "./EmptyState";
import type { Task } from "@/lib/types";
import { buildTree, type TaskNode } from "@/lib/task-utils";

interface Props {
  tasks: Task[];
  completedTasks?: Task[];
  loading?: boolean;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<Task>) => void;
  emptyText?: string;
  emptySubtext?: string;
  currentUserEmail?: string;
}

export function TaskList({
  tasks,
  completedTasks,
  loading,
  onComplete,
  onDelete,
  onUpdate,
  emptyText = "暂无任务",
  emptySubtext,
  currentUserEmail,
}: Props) {
  const [showCompleted, setShowCompleted] = useState(false);

  if (loading) return <TaskSkeleton />;

  if (tasks.length === 0 && !completedTasks?.length) {
    return <EmptyState text={emptyText} subtext={emptySubtext} />;
  }

  const tree = buildTree(tasks);

  return (
    <div>
      {tree.map((node) => (
        <TaskItem
          key={node.id}
          task={node}
          subtasks={node.subtasks}
          onComplete={onComplete}
          onDelete={onDelete}
          onUpdate={onUpdate}
          currentUserEmail={currentUserEmail}
        />
      ))}

      {/* Completed tasks section */}
      {completedTasks && completedTasks.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            <span className="text-[10px]">{showCompleted ? "▼" : "▶"}</span>
            <span>已完成 ({completedTasks.length})</span>
          </button>

          {showCompleted && (
            <div className="mt-1 opacity-60">
              {completedTasks.map((task) => (
                <div key={task.id} className="flex items-start gap-3 py-2 px-1 border-b last:border-0 border-border/30">
                  <div className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-muted-foreground/20 flex items-center justify-center">
                    <span className="text-[8px] text-muted-foreground">✓</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm line-through text-muted-foreground truncate">{task.title}</p>
                    {task.completed_at && (
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {new Date(task.completed_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
