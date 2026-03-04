"use client";

import type { Task, SpaceMember } from "@/lib/types";
import { daysBetween, addDays, formatAxisDate, getMemberName } from "@/lib/gantt-utils";

interface Props {
  tasks: Task[];
  members: SpaceMember[];
  onTaskClick?: (id: string) => void;
}

const PRIORITY_COLORS: Record<number, string> = {
  0: "bg-danger",
  1: "bg-warning",
  2: "bg-info",
  3: "bg-charcoal",
};

const PRIORITY_BORDER_COLORS: Record<number, string> = {
  0: "border-danger",
  1: "border-warning",
  2: "border-info",
  3: "border-charcoal",
};

const PRIORITY_TEXT_COLORS: Record<number, string> = {
  0: "text-danger-foreground",
  1: "text-warning-foreground",
  2: "text-info-foreground",
  3: "text-paper",
};

export function GanttChart({ tasks, members, onTaskClick }: Props) {
  // Split tasks into scheduled (has start_date or end_date or due_date) and unscheduled
  const scheduled = tasks.filter(
    (t) => t.start_date || t.end_date || t.due_date
  );
  const unscheduled = tasks.filter(
    (t) => !t.start_date && !t.end_date && !t.due_date
  );

  if (scheduled.length === 0 && unscheduled.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        暂无任务数据
      </div>
    );
  }

  // Compute axis range
  const dates: Date[] = [];
  for (const t of scheduled) {
    if (t.start_date) dates.push(new Date(t.start_date));
    if (t.end_date) dates.push(new Date(t.end_date));
    if (t.due_date) dates.push(new Date(t.due_date));
    dates.push(new Date(t.created_at));
  }

  const minDate = dates.length > 0
    ? new Date(Math.min(...dates.map((d) => d.getTime())))
    : new Date();
  const maxDate = dates.length > 0
    ? new Date(Math.max(...dates.map((d) => d.getTime())))
    : addDays(new Date(), 14);

  // Pad range: 1 day before, 7 days after
  const rangeStart = addDays(minDate, -1);
  const rangeEnd = addDays(maxDate, 7);
  const totalDays = Math.max(daysBetween(rangeStart, rangeEnd), 1);

  // Generate week markers for header
  const weekMarkers: Array<{ date: Date; leftPct: number }> = [];
  let cur = new Date(rangeStart);
  // Align to Monday
  const dayOfWeek = cur.getDay();
  cur = addDays(cur, dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7);
  while (cur <= rangeEnd) {
    weekMarkers.push({
      date: new Date(cur),
      leftPct: (daysBetween(rangeStart, cur) / totalDays) * 100,
    });
    cur = addDays(cur, 7);
  }

  const today = new Date();
  const todayLeftPct = (daysBetween(rangeStart, today) / totalDays) * 100;
  const showTodayLine = todayLeftPct >= 0 && todayLeftPct <= 100;

  return (
    <div className="text-xs">
      <div className="flex">
        {/* Left fixed label column */}
        <div className="flex-shrink-0 w-40">
          {/* Header spacer */}
          <div className="h-8 border-b border-r border-border/50" />
          {scheduled.map((task) => (
            <div
              key={task.id}
              className="h-10 border-b border-r border-border/30 flex items-center px-2 gap-1.5 overflow-hidden"
            >
              <div
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS[2]}`}
              />
              <span
                className="truncate text-[11px] cursor-pointer hover:text-primary transition-colors"
                onClick={() => onTaskClick?.(task.id)}
                title={task.title}
              >
                {task.title}
              </span>
              {task.assignee_email && (
                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[8px] font-medium uppercase">
                  {task.assignee_email[0]}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Right scrollable timeline */}
        <div className="flex-1 overflow-x-auto">
          {/* Min width ensures bars are wide enough */}
          <div style={{ minWidth: `${Math.max(totalDays * 16, 400)}px`, position: "relative" }}>
            {/* Header: week markers */}
            <div className="h-8 border-b border-border/50 relative bg-muted/20">
              {weekMarkers.map((wm, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 flex items-center"
                  style={{ left: `${wm.leftPct}%` }}
                >
                  <div className="h-full w-px bg-border/30" />
                  <span className="text-[10px] text-muted-foreground ml-1 whitespace-nowrap">
                    {formatAxisDate(wm.date)}
                  </span>
                </div>
              ))}
              {showTodayLine && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-warning opacity-60 z-10"
                  style={{ left: `${todayLeftPct}%` }}
                />
              )}
            </div>

            {/* Task rows */}
            {scheduled.map((task) => {
              const taskStart = task.start_date
                ? new Date(task.start_date)
                : task.due_date
                ? addDays(new Date(task.due_date), -1)
                : new Date(task.created_at);

              const taskEnd = task.end_date
                ? new Date(task.end_date)
                : task.due_date
                ? new Date(task.due_date)
                : addDays(taskStart, 1);

              const leftPct = (daysBetween(rangeStart, taskStart) / totalDays) * 100;
              const duration = Math.max(daysBetween(taskStart, taskEnd), 0.5);
              const widthPct = Math.max((duration / totalDays) * 100, 1);
              const isDiamond = !task.start_date && !task.end_date; // only due_date

              const colorClass = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS[2];
              const borderClass = PRIORITY_BORDER_COLORS[task.priority] ?? PRIORITY_BORDER_COLORS[2];
              const textClass = PRIORITY_TEXT_COLORS[task.priority] ?? PRIORITY_TEXT_COLORS[2];

              return (
                <div
                  key={task.id}
                  className="h-10 border-b border-border/20 relative"
                >
                  {showTodayLine && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-warning opacity-20 z-0"
                      style={{ left: `${todayLeftPct}%` }}
                    />
                  )}
                  <div
                    className={`absolute top-2.5 h-5 rounded cursor-pointer transition-opacity hover:opacity-80 z-10
                      ${isDiamond ? `w-5 rotate-45 border-2 bg-background ${borderClass}` : `${colorClass} opacity-80`}
                    `}
                    style={{
                      left: `${leftPct}%`,
                      width: isDiamond ? undefined : `${widthPct}%`,
                    }}
                    title={`${task.title}${task.start_date ? `\n开始: ${new Date(task.start_date).toLocaleDateString("zh-CN")}` : ""}${task.end_date ? `\n结束: ${new Date(task.end_date).toLocaleDateString("zh-CN")}` : ""}${task.due_date && !task.start_date && !task.end_date ? `\n截止: ${new Date(task.due_date).toLocaleDateString("zh-CN")}` : ""}`}
                    onClick={() => onTaskClick?.(task.id)}
                  >
                    {!isDiamond && (
                      <span className={`absolute inset-0 flex items-center px-1.5 text-[9px] ${textClass} font-medium truncate`}>
                        {task.assignee_email ? getMemberName(task.assignee_email, members) : ""}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Unscheduled tasks */}
      {unscheduled.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border/30">
          <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide mb-1.5">
            未排期任务 ({unscheduled.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.map((task) => (
              <button
                key={task.id}
                onClick={() => onTaskClick?.(task.id)}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors hover:bg-muted/50
                  ${task.status === 2 ? "text-muted-foreground/50 line-through border-border/30" : "text-foreground border-border"}`}
              >
                {task.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
