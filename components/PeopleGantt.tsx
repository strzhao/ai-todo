"use client";

import type { Task, SpaceMember } from "@/lib/types";
import { formatAxisDate, groupTasksByMember } from "@/lib/gantt-utils";

interface Props {
  tasks: Task[];
  members: SpaceMember[];
  onTaskClick?: (id: string) => void;
}

const PRIORITY_LEFT_BORDER: Record<number, string> = {
  0: "border-l-danger",
  1: "border-l-warning",
  2: "border-l-info",
  3: "border-l-charcoal",
};

const PRIORITY_LABELS: Record<number, string> = {
  0: "P0",
  1: "P1",
  2: "P2",
  3: "P3",
};

function getDateLabel(task: Task): string | null {
  if (task.start_date && task.end_date) {
    return `${formatAxisDate(new Date(task.start_date))} - ${formatAxisDate(new Date(task.end_date))}`;
  }
  if (task.start_date) {
    return `${formatAxisDate(new Date(task.start_date))} 起`;
  }
  if (task.due_date) {
    return `截止 ${formatAxisDate(new Date(task.due_date))}`;
  }
  return null;
}

function isActiveToday(task: Task): boolean {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);

  if (task.start_date && task.end_date) {
    const s = new Date(task.start_date);
    const e = new Date(task.end_date);
    return s <= tomorrow && e >= today;
  }
  if (task.due_date) {
    const d = new Date(task.due_date);
    return d >= today;
  }
  return false;
}

export function PeopleGantt({ tasks, members, onTaskClick }: Props) {
  const scheduled = tasks.filter(
    (t) => t.start_date || t.end_date || t.due_date
  );

  if (scheduled.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        暂无排期任务
      </div>
    );
  }

  const groups = groupTasksByMember(scheduled, members);

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.member?.email ?? "unassigned"}>
          {/* Member header */}
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-sage-mist flex items-center justify-center text-[11px] font-medium text-sage">
              {g.label[0]?.toUpperCase() ?? "?"}
            </span>
            <span className="text-[13px] font-medium text-foreground">
              {g.label}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {g.tasks.length} 项
            </span>
          </div>

          {/* Task cards */}
          <div className="flex flex-wrap gap-2 pl-9">
            {g.tasks.map((task) => {
              const dateLabel = getDateLabel(task);
              const isCompleted = task.status === 2;
              const active = !isCompleted && isActiveToday(task);
              const borderClass =
                PRIORITY_LEFT_BORDER[task.priority] ??
                PRIORITY_LEFT_BORDER[2];

              return (
                <div
                  key={task.id}
                  className={`border-l-[3px] ${borderClass} rounded-r bg-muted/40 px-2.5 py-1.5 cursor-pointer
                    transition-colors hover:bg-muted/70 min-w-[120px] max-w-[200px]
                    ${isCompleted ? "opacity-45" : ""}
                    ${active ? "ring-1 ring-sage/30" : ""}
                  `}
                  onClick={() => onTaskClick?.(task.id)}
                >
                  <div
                    className={`text-[13px] leading-snug font-medium truncate ${
                      isCompleted
                        ? "line-through text-muted-foreground"
                        : "text-foreground"
                    }`}
                  >
                    {task.title}
                  </div>
                  {(dateLabel || task.priority <= 1) && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {dateLabel && (
                        <span className="text-[11px] text-muted-foreground">
                          {dateLabel}
                        </span>
                      )}
                      {task.priority <= 1 && (
                        <span
                          className={`text-[10px] font-medium ${
                            task.priority === 0
                              ? "text-danger"
                              : "text-warning"
                          }`}
                        >
                          {PRIORITY_LABELS[task.priority]}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
