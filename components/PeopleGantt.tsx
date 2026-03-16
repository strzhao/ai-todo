"use client";

import { useState, useMemo, memo } from "react";
import type { Task, SpaceMember } from "@/lib/types";
import {
  addDays,
  formatAxisDate,
  groupTasksByMember,
  getWeekStartMonday,
  taskCoversDay,
  taskCoversRange,
  isSameDay,
  isWeekend,
} from "@/lib/gantt-utils";

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
};

const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export const PeopleGantt = memo(function PeopleGantt({ tasks, members, onTaskClick }: Props) {
  console.log(`[perf] PeopleGantt render start, tasks: ${tasks.length}`);
  const renderStart = performance.now();
  const [weekOffset, setWeekOffset] = useState(0);

  const today = new Date();
  const weekStart = useMemo(() => getWeekStartMonday(today, weekOffset), [weekOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const scheduled = useMemo(() => tasks.filter(
    (t) => t.start_date || t.end_date || t.due_date,
  ), [tasks]);

  // Pre-compute week range timestamps once for fast interval overlap check
  const weekRangeMs = useMemo(() => ({
    start: weekStart.getTime(),
    end: addDays(weekStart, 7).getTime(),
  }), [weekStart]);

  // Filter to week + group by member in one pass
  const groups = useMemo(() => {
    const allGroups = groupTasksByMember(scheduled, members);
    return allGroups
      .map((g) => {
        // Use range check instead of 7x taskCoversDay per task
        const weekTasks = g.tasks.filter((t) =>
          taskCoversRange(t, weekRangeMs.start, weekRangeMs.end),
        );
        return { ...g, weekTasks };
      })
      .filter((g) => g.weekTasks.length > 0);
  }, [scheduled, members, weekRangeMs]);

  // Pre-compute day→tasks mapping per group to avoid filtering in MemberRow render
  const groupDayTasks = useMemo(() => {
    const result = new Map<string, Task[][]>();
    for (const g of groups) {
      const dayBuckets: Task[][] = days.map((day) =>
        g.weekTasks.filter((t) => taskCoversDay(t, day))
      );
      result.set(g.member?.email ?? "unassigned", dayBuckets);
    }
    return result;
  }, [groups, days]);

  if (groups.length === 0) {
    console.log(`[perf] PeopleGantt empty, render: ${(performance.now() - renderStart).toFixed(1)}ms, scheduled: ${scheduled.length}`);
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        {scheduled.length === 0
          ? "暂无排期任务"
          : "本周暂无排期任务，试试切换到其他周"}
      </div>
    );
  }

  console.log(`[perf] PeopleGantt render done: ${(performance.now() - renderStart).toFixed(1)}ms, groups: ${groups.length}`);
  return (
    <div className="text-xs">
      {/* 周导航 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className="px-2 py-1 rounded hover:bg-muted transition-colors text-muted-foreground text-[11px]"
          >
            ← 上周
          </button>
          <span className="text-[13px] font-medium text-foreground">
            {formatAxisDate(weekStart)} - {formatAxisDate(addDays(weekStart, 6))}
          </span>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            className="px-2 py-1 rounded hover:bg-muted transition-colors text-muted-foreground text-[11px]"
          >
            下周 →
          </button>
        </div>
        {weekOffset !== 0 && (
          <button
            onClick={() => setWeekOffset(0)}
            className="text-[11px] text-sage hover:text-sage-light transition-colors"
          >
            回到本周
          </button>
        )}
      </div>

      {/* 网格 */}
      <div className="overflow-x-auto">
        <div
          className="grid"
          style={{
            gridTemplateColumns: "100px repeat(7, minmax(90px, 1fr))",
            minWidth: 730,
          }}
        >
          {/* 表头 */}
          <div className="sticky left-0 z-20 bg-background border-b border-border/40" />
          {days.map((day, i) => {
            const isToday = isSameDay(day, today);
            return (
              <div
                key={i}
                className={`text-center py-2 border-b border-border/40 text-[11px]
                  ${isToday ? "bg-sage-mist/50 font-medium text-sage" : "text-muted-foreground"}
                  ${!isToday && isWeekend(day) ? "bg-muted/20" : ""}`}
              >
                <div>{WEEKDAY_NAMES[day.getDay()]}</div>
                <div className={isToday ? "text-sage" : ""}>
                  {formatAxisDate(day)}
                </div>
              </div>
            );
          })}

          {/* 成员行 */}
          {groups.map((g) => {
            const key = g.member?.email ?? "unassigned";
            const dayBuckets = groupDayTasks.get(key) ?? [];
            return (
              <MemberRow
                key={key}
                group={g}
                dayBuckets={dayBuckets}
                days={days}
                today={today}
                onTaskClick={onTaskClick}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});

/* ---------- MemberRow ---------- */

interface MemberRowProps {
  group: {
    member: SpaceMember | null;
    label: string;
    weekTasks: Task[];
  };
  dayBuckets: Task[][];
  days: Date[];
  today: Date;
  onTaskClick?: (id: string) => void;
}

const MemberRow = memo(function MemberRow({ group, dayBuckets, days, today, onTaskClick }: MemberRowProps) {
  return (
    <>
      {/* 成员名（左列） */}
      <div className="sticky left-0 z-10 bg-background border-b border-r border-border/20 flex items-start gap-1.5 px-2 py-2">
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-sage-mist flex items-center justify-center text-[10px] font-medium text-sage mt-0.5">
          {group.label[0]?.toUpperCase() ?? "?"}
        </span>
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-foreground leading-tight truncate">
            {group.label}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {group.weekTasks.length} 项
          </div>
        </div>
      </div>

      {/* 7 个日格子 — dayBuckets 已预计算，无需再 filter */}
      {days.map((day, i) => {
        const dayTasks = dayBuckets[i] ?? [];
        const isToday = isSameDay(day, today);

        return (
          <div
            key={i}
            className={`min-h-[52px] p-1 border-b border-r border-border/20 flex flex-col gap-1
              ${isToday ? "bg-sage-mist/20" : ""}
              ${!isToday && isWeekend(day) ? "bg-muted/15" : ""}`}
          >
            {dayTasks.map((task) => (
              <TaskChip
                key={task.id}
                task={task}
                onClick={() => onTaskClick?.(task.id)}
              />
            ))}
          </div>
        );
      })}
    </>
  );
});

/* ---------- TaskChip ---------- */

function TaskChip({ task, onClick }: { task: Task; onClick: () => void }) {
  const isCompleted = task.status === 2;
  const borderClass =
    PRIORITY_LEFT_BORDER[task.priority] ?? PRIORITY_LEFT_BORDER[2];

  return (
    <div
      className={`border-l-[3px] ${borderClass} rounded-r bg-muted/40 px-1.5 py-1
        cursor-pointer hover:bg-muted/70 transition-colors
        ${isCompleted ? "opacity-45" : ""}`}
      onClick={onClick}
    >
      <div
        className={`text-[11px] leading-tight truncate ${
          isCompleted
            ? "line-through text-muted-foreground"
            : "text-foreground"
        }`}
      >
        {task.title}
      </div>
      {!isCompleted && task.priority <= 1 && (
        <span
          className={`text-[9px] font-medium ${
            task.priority === 0 ? "text-danger" : "text-warning"
          }`}
        >
          {PRIORITY_LABELS[task.priority]}
        </span>
      )}
    </div>
  );
}
