"use client";

import type { Task, SpaceMember } from "@/lib/types";
import {
  daysBetween,
  addDays,
  formatAxisDate,
  groupTasksByMember,
} from "@/lib/gantt-utils";

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

  // Compute axis range from all scheduled tasks
  const dates: Date[] = [];
  for (const t of scheduled) {
    if (t.start_date) dates.push(new Date(t.start_date));
    if (t.end_date) dates.push(new Date(t.end_date));
    if (t.due_date) dates.push(new Date(t.due_date));
    dates.push(new Date(t.created_at));
  }

  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
  const rangeStart = addDays(minDate, -1);
  const rangeEnd = addDays(maxDate, 7);
  const totalDays = Math.max(daysBetween(rangeStart, rangeEnd), 1);

  // Week markers
  const weekMarkers: Array<{ date: Date; leftPct: number }> = [];
  let cur = new Date(rangeStart);
  const dow = cur.getDay();
  cur = addDays(cur, dow === 0 ? 1 : (8 - dow) % 7 || 7);
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

  function getBarProps(task: Task) {
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
    const isDiamond = !task.start_date && !task.end_date;

    return { leftPct, widthPct, isDiamond, taskStart, taskEnd };
  }

  return (
    <div className="text-xs">
      <div className="flex">
        {/* Left: member labels */}
        <div className="flex-shrink-0 w-40">
          <div className="h-8 border-b border-r border-border/50" />
          {groups.map((g) => (
            <div
              key={g.member?.email ?? "unassigned"}
              className="h-12 border-b border-r border-border/30 flex items-center px-2 gap-1.5"
            >
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-sage-mist flex items-center justify-center text-[10px] font-medium text-sage">
                {g.label[0]?.toUpperCase() ?? "?"}
              </span>
              <span className="text-[11px] font-medium text-charcoal truncate">{g.label}</span>
              <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">{g.tasks.length}</span>
            </div>
          ))}
        </div>

        {/* Right: timeline */}
        <div className="flex-1 overflow-x-auto">
          <div style={{ minWidth: `${Math.max(totalDays * 16, 400)}px`, position: "relative" }}>
            {/* Header */}
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

            {/* Person rows */}
            {groups.map((g) => (
              <div
                key={g.member?.email ?? "unassigned"}
                className="h-12 border-b border-border/20 relative"
              >
                {showTodayLine && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-warning opacity-20 z-0"
                    style={{ left: `${todayLeftPct}%` }}
                  />
                )}
                {g.tasks.map((task) => {
                  const { leftPct, widthPct, isDiamond } = getBarProps(task);
                  const colorClass = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS[2];
                  const borderClass = PRIORITY_BORDER_COLORS[task.priority] ?? PRIORITY_BORDER_COLORS[2];

                  return (
                    <div
                      key={task.id}
                      className={`absolute top-2 h-8 rounded cursor-pointer transition-all hover:opacity-100 hover:z-20 z-10
                        ${isDiamond ? `w-4 rotate-45 border-2 bg-background ${borderClass} !h-4 !top-4` : `${colorClass} opacity-60`}
                      `}
                      style={{
                        left: `${leftPct}%`,
                        width: isDiamond ? undefined : `${widthPct}%`,
                      }}
                      title={`${task.title}${task.start_date ? `\n开始: ${new Date(task.start_date).toLocaleDateString("zh-CN")}` : ""}${task.end_date ? `\n结束: ${new Date(task.end_date).toLocaleDateString("zh-CN")}` : ""}${task.due_date && !task.start_date && !task.end_date ? `\n截止: ${new Date(task.due_date).toLocaleDateString("zh-CN")}` : ""}`}
                      onClick={() => onTaskClick?.(task.id)}
                    >
                      {!isDiamond && (
                        <span className="absolute inset-0 flex items-center px-1.5 text-[9px] text-white font-medium truncate">
                          {task.title}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
