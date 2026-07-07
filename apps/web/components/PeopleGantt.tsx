"use client";

import { useState, useMemo, memo, useEffect } from "react";
import type { Task, SpaceMember } from "@/lib/types";
import {
  addDays,
  formatAxisDate,
  groupTasksByMember,
  getWeekStartMonday,
  taskCoversRange,
  isSameDay,
  isWeekend,
  computeTaskBars,
} from "@/lib/gantt-utils";
import type { TaskBar } from "@/lib/gantt-utils";

interface Props {
  tasks: Task[];
  members: SpaceMember[];
  onTaskClick?: (id: string) => void;
  onWeekChange?: (dateFrom: string, dateTo: string) => void;
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

export const PeopleGantt = memo(function PeopleGantt({
  tasks,
  members,
  onTaskClick,
  onWeekChange,
}: Props) {
  const [weekOffset, setWeekOffset] = useState(0);

  const today = new Date();
  const weekStart = useMemo(() => getWeekStartMonday(today, weekOffset), [weekOffset]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // Notify parent when week changes (including initial mount)
  useEffect(() => {
    if (!onWeekChange) return;
    const toISODate = (d: Date) => d.toISOString().slice(0, 10);
    onWeekChange(toISODate(weekStart), toISODate(addDays(weekStart, 7)));
  }, [weekStart, onWeekChange]);

  const scheduled = useMemo(
    () => tasks.filter((t) => t.start_date || t.end_date || t.due_date),
    [tasks]
  );

  // Pre-compute week range timestamps once for fast interval overlap check
  const weekRangeMs = useMemo(
    () => ({
      start: weekStart.getTime(),
      end: addDays(weekStart, 7).getTime(),
    }),
    [weekStart]
  );

  // Filter to week + group by member in one pass
  const groups = useMemo(() => {
    const allGroups = groupTasksByMember(scheduled, members);
    return allGroups
      .map((g) => {
        // Use range check instead of 7x taskCoversDay per task
        const weekTasks = g.tasks.filter((t) =>
          taskCoversRange(t, weekRangeMs.start, weekRangeMs.end)
        );
        return { ...g, weekTasks };
      })
      .filter((g) => g.weekTasks.length > 0);
  }, [scheduled, members, weekRangeMs]);

  // Pre-compute TaskBar layout per group
  const groupTaskBars = useMemo(() => {
    const result = new Map<string, TaskBar[]>();
    for (const g of groups) {
      result.set(g.member?.email ?? "unassigned", computeTaskBars(g.weekTasks, days));
    }
    return result;
  }, [groups, days]);

  if (groups.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        {scheduled.length === 0 ? "暂无排期任务" : "本周暂无排期任务，试试切换到其他周"}
      </div>
    );
  }

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
                <div className={isToday ? "text-sage" : ""}>{formatAxisDate(day)}</div>
              </div>
            );
          })}

          {/* 成员行 */}
          {groups.map((g) => {
            const key = g.member?.email ?? "unassigned";
            const bars = groupTaskBars.get(key) ?? [];
            return (
              <MemberRow
                key={key}
                group={g}
                bars={bars}
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
  bars: TaskBar[];
  days: Date[];
  today: Date;
  onTaskClick?: (id: string) => void;
}

const MemberRow = memo(function MemberRow({
  group,
  bars,
  days,
  today,
  onTaskClick,
}: MemberRowProps) {
  const maxRow = bars.reduce((max, b) => Math.max(max, b.row), -1);
  const containerHeight = Math.max(52, (maxRow + 1) * (BAR_HEIGHT + BAR_GAP) + BAR_PAD_TOP * 2);

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
          <div className="text-[10px] text-muted-foreground">{group.weekTasks.length} 项</div>
        </div>
      </div>

      {/* 日期区域：合并 7 列 */}
      <div style={{ gridColumn: "2 / -1", position: "relative" }}>
        {/* Layer 1: 7 个背景格 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {days.map((day, i) => {
            const isToday = isSameDay(day, today);
            return (
              <div
                key={i}
                className={`border-b border-r border-border/20
                  ${isToday ? "bg-sage-mist/20" : ""}
                  ${!isToday && isWeekend(day) ? "bg-muted/15" : ""}`}
                style={{ minHeight: `${containerHeight}px` }}
              />
            );
          })}
        </div>
        {/* Layer 2: 任务横条 */}
        <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
          {bars.map((bar) => (
            <TaskBarEl key={bar.task.id} bar={bar} onClick={() => onTaskClick?.(bar.task.id)} />
          ))}
        </div>
      </div>
    </>
  );
});

/* ---------- TaskBarEl ---------- */

const BAR_HEIGHT = 24;
const BAR_GAP = 4;
const BAR_PAD_TOP = 4;
const BAR_INSET = 2; // px inset from cell edge

function TaskBarEl({ bar, onClick }: { bar: TaskBar; onClick: () => void }) {
  const isCompleted = bar.task.status === 2;
  const isMilestone = !!bar.task.milestone;
  const borderClass = isMilestone
    ? "border-l-sage"
    : (PRIORITY_LEFT_BORDER[bar.task.priority] ?? PRIORITY_LEFT_BORDER[2]);
  const bgClass = isMilestone ? "bg-sage/15 hover:bg-sage/25" : "bg-muted/40 hover:bg-muted/70";

  const left = `calc(${(bar.startCol / 7) * 100}% + ${BAR_INSET}px)`;
  const width = `calc(${(bar.spanCols / 7) * 100}% - ${BAR_INSET * 2}px)`;
  const top = BAR_PAD_TOP + bar.row * (BAR_HEIGHT + BAR_GAP);

  return (
    <div
      className={`absolute border-l-[3px] ${borderClass} rounded-r ${bgClass}
        cursor-pointer transition-colors flex items-center gap-1 px-1.5
        ${isCompleted ? "opacity-45" : ""}`}
      style={{
        left,
        width,
        top: `${top}px`,
        height: `${BAR_HEIGHT}px`,
        pointerEvents: "auto",
      }}
      onClick={onClick}
    >
      <span
        className={`text-[11px] leading-tight truncate ${
          isCompleted ? "line-through text-muted-foreground" : "text-foreground"
        }`}
      >
        {isMilestone && "\ud83d\udea9"}
        {bar.task.title}
      </span>
      {!isCompleted && bar.task.priority <= 1 && (
        <span
          className={`text-[9px] font-medium flex-shrink-0 ${
            bar.task.priority === 0 ? "text-danger" : "text-warning"
          }`}
        >
          {PRIORITY_LABELS[bar.task.priority]}
        </span>
      )}
    </div>
  );
}
