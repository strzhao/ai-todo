"use client";

import { TaskItem } from "./TaskItem";
import type { Task } from "@/lib/types";

interface Props {
  tasks: Task[];
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  emptyText?: string;
}

export function TaskList({ tasks, onComplete, onDelete, emptyText = "暂无任务" }: Props) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">{emptyText}</p>
      </div>
    );
  }

  return (
    <div>
      {tasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          onComplete={onComplete}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
