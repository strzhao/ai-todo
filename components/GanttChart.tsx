"use client";

import { useMemo, memo, useState, useRef, useCallback } from "react";
import type { Task, SpaceMember } from "@/lib/types";
import { daysBetween, addDays, formatAxisDate, getMemberName, groupByTopLevel } from "@/lib/gantt-utils";
import type { GanttRow } from "@/lib/gantt-utils";

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

// Row height constants
const SOLO_ROW_HEIGHT = 40;       // 无子任务的行高
const ROOT_BAR_AREA = 28;         // 一级任务条形区域高度
const CHILD_BAR_HEIGHT = 16;      // 折叠态每个子任务条行高
const MAX_STACKED = 3;            // 折叠态最多显示几个子任务
const EXPANDED_CHILD_ROW = 28;    // 展开态每个子任务行高

function computeRowHeight(row: GanttRow, expanded: boolean): number {
  const scheduledChildren = row.children.length;
  if (scheduledChildren === 0) return SOLO_ROW_HEIGHT;
  if (expanded) return ROOT_BAR_AREA + scheduledChildren * EXPANDED_CHILD_ROW;
  return ROOT_BAR_AREA + Math.min(scheduledChildren, MAX_STACKED) * CHILD_BAR_HEIGHT;
}

interface BarPosition {
  task: Task;
  leftPct: number;
  widthPct: number;
  isDiamond: boolean;
}

function computeBarPosition(task: Task, rangeStart: Date, totalDays: number): BarPosition {
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

  return { task, leftPct, widthPct, isDiamond };
}

export const GanttChart = memo(function GanttChart({ tasks, members, onTaskClick }: Props) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((taskId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  // Group tasks by top-level
  const rows = useMemo(() => groupByTopLevel(tasks), [tasks]);

  // Collect all tasks with dates for time range calculation
  const allScheduled = useMemo(() => {
    const result: Task[] = [];
    for (const row of rows) {
      const root = row.rootTask;
      if (root.start_date || root.end_date || root.due_date) result.push(root);
      result.push(...row.children);
    }
    return result;
  }, [rows]);

  // Unscheduled top-level tasks (no dates on root AND no scheduled children)
  const unscheduledRoots = useMemo(
    () => rows.filter(
      (r) => !r.rootTask.start_date && !r.rootTask.end_date && !r.rootTask.due_date && r.children.length === 0
    ),
    [rows],
  );

  // Rows that appear in the gantt chart (root has dates OR has scheduled children)
  const ganttRows = useMemo(
    () => rows.filter(
      (r) => r.rootTask.start_date || r.rootTask.end_date || r.rootTask.due_date || r.children.length > 0
    ),
    [rows],
  );

  const { rangeStart, totalDays, weekMarkers, todayLeftPct, showTodayLine } = useMemo(() => {
    if (allScheduled.length === 0) {
      return { rangeStart: new Date(), totalDays: 1, weekMarkers: [] as Array<{ date: Date; leftPct: number }>, todayLeftPct: 0, showTodayLine: false };
    }
    const dates: Date[] = [];
    for (const t of allScheduled) {
      if (t.start_date) dates.push(new Date(t.start_date));
      if (t.end_date) dates.push(new Date(t.end_date));
      if (t.due_date) dates.push(new Date(t.due_date));
      dates.push(new Date(t.created_at));
    }

    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
    const rs = addDays(minDate, -1);
    const re = addDays(maxDate, 7);
    const td = Math.max(daysBetween(rs, re), 1);

    const wm: Array<{ date: Date; leftPct: number }> = [];
    let cur = new Date(rs);
    const dow = cur.getDay();
    cur = addDays(cur, dow === 0 ? 1 : (8 - dow) % 7 || 7);
    while (cur <= re) {
      wm.push({ date: new Date(cur), leftPct: (daysBetween(rs, cur) / td) * 100 });
      cur = addDays(cur, 7);
    }

    const today = new Date();
    const tlp = (daysBetween(rs, today) / td) * 100;
    return { rangeStart: rs, totalDays: td, weekMarkers: wm, todayLeftPct: tlp, showTodayLine: tlp >= 0 && tlp <= 100 };
  }, [allScheduled]);

  // Pre-build member name lookup
  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasks) {
      if (t.assignee_email && !map.has(t.assignee_email)) {
        map.set(t.assignee_email, getMemberName(t.assignee_email, members));
      }
    }
    return map;
  }, [tasks, members]);

  // Sync horizontal scroll between header and body
  const timelineHeaderRef = useRef<HTMLDivElement>(null);
  const timelineBodyRef = useRef<HTMLDivElement>(null);

  const handleHorizontalScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;
    if (timelineHeaderRef.current) timelineHeaderRef.current.scrollLeft = scrollLeft;
  }, []);

  if (ganttRows.length === 0 && unscheduledRoots.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        暂无任务数据
      </div>
    );
  }

  const timelineWidth = Math.max(totalDays * 16, 400);

  return (
    <div className="text-xs">
      {/* Sticky header row */}
      <div className="flex">
        <div className="flex-shrink-0 w-44">
          <div className="h-8 border-b border-r border-border/50" />
        </div>
        <div className="flex-1 overflow-hidden" ref={timelineHeaderRef}>
          <div style={{ minWidth: `${timelineWidth}px`, position: "relative" }}>
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
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex overflow-y-auto" style={{ maxHeight: "600px" }}>
        {/* Left fixed label column */}
        <div className="flex-shrink-0 w-44">
          {ganttRows.map((row) => {
            const expanded = expandedRows.has(row.rootTask.id);
            const rowHeight = computeRowHeight(row, expanded);
            const hasChildren = row.children.length > 0 || row.unscheduledCount > 0;
            const totalChildren = row.children.length + row.unscheduledCount;

            return (
              <div
                key={row.rootTask.id}
                className="border-b border-r border-border/30 overflow-hidden"
                style={{ height: rowHeight }}
              >
                {/* Root task label */}
                <div className="h-7 flex items-center px-1.5 gap-1">
                  {hasChildren ? (
                    <button
                      className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => toggleExpand(row.rootTask.id)}
                    >
                      <svg
                        className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : (
                    <span className="flex-shrink-0 w-4" />
                  )}
                  {row.rootTask.assignee_email ? (
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-sage-mist flex items-center justify-center text-[10px] font-medium text-sage">
                      {memberNameMap.get(row.rootTask.assignee_email)?.[0]?.toUpperCase()}
                    </span>
                  ) : (
                    <span className="flex-shrink-0 w-5" />
                  )}
                  <span
                    className="truncate text-[11px] cursor-pointer hover:text-primary transition-colors font-medium"
                    onClick={() => onTaskClick?.(row.rootTask.id)}
                    title={row.rootTask.title}
                  >
                    {row.rootTask.title}
                  </span>
                  {hasChildren && (
                    <span className="text-[9px] text-muted-foreground flex-shrink-0 ml-auto">
                      ({totalChildren})
                    </span>
                  )}
                </div>

                {/* Expanded child labels */}
                {expanded && row.children.map((child) => (
                  <div
                    key={child.id}
                    className="flex items-center px-1.5 gap-1 pl-7"
                    style={{ height: EXPANDED_CHILD_ROW }}
                  >
                    {child.assignee_email ? (
                      <span className="flex-shrink-0 w-4 h-4 rounded-full bg-sage-mist flex items-center justify-center text-[9px] font-medium text-sage">
                        {memberNameMap.get(child.assignee_email)?.[0]?.toUpperCase()}
                      </span>
                    ) : (
                      <span className="flex-shrink-0 w-4" />
                    )}
                    <span
                      className="truncate text-[10px] cursor-pointer hover:text-primary transition-colors text-muted-foreground"
                      onClick={() => onTaskClick?.(child.id)}
                      title={child.title}
                    >
                      {child.title}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Right scrollable timeline */}
        <div className="flex-1 overflow-x-auto" ref={timelineBodyRef} onScroll={handleHorizontalScroll}>
          <div style={{ minWidth: `${timelineWidth}px`, position: "relative" }}>
            {ganttRows.map((row) => {
              const expanded = expandedRows.has(row.rootTask.id);
              const rowHeight = computeRowHeight(row, expanded);
              const rootTask = row.rootTask;
              const rootHasDate = !!(rootTask.start_date || rootTask.end_date || rootTask.due_date);

              return (
                <div key={row.rootTask.id} className="border-b border-border/20 relative" style={{ height: rowHeight }}>
                  {/* Today line */}
                  {showTodayLine && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-warning opacity-20 z-0"
                      style={{ left: `${todayLeftPct}%` }}
                    />
                  )}

                  {/* Root task bar */}
                  {rootHasDate && (
                    <RootBar
                      bar={computeBarPosition(rootTask, rangeStart, totalDays)}
                      memberNameMap={memberNameMap}
                      onTaskClick={onTaskClick}
                    />
                  )}

                  {/* Child task bars */}
                  {!expanded ? (
                    // Collapsed: stack up to MAX_STACKED children
                    <>
                      {row.children.slice(0, MAX_STACKED).map((child, idx) => {
                        const bar = computeBarPosition(child, rangeStart, totalDays);
                        return (
                          <ChildBar
                            key={child.id}
                            bar={bar}
                            top={ROOT_BAR_AREA + idx * CHILD_BAR_HEIGHT}
                            height={CHILD_BAR_HEIGHT - 2}
                            onTaskClick={onTaskClick}
                          />
                        );
                      })}
                      {row.children.length > MAX_STACKED && (
                        <div
                          className="absolute text-[9px] text-muted-foreground cursor-pointer hover:text-foreground"
                          style={{ top: ROOT_BAR_AREA + MAX_STACKED * CHILD_BAR_HEIGHT, left: 4 }}
                          onClick={() => toggleExpand(row.rootTask.id)}
                        >
                          +{row.children.length - MAX_STACKED} 更多
                        </div>
                      )}
                    </>
                  ) : (
                    // Expanded: each child gets its own row
                    row.children.map((child, idx) => {
                      const bar = computeBarPosition(child, rangeStart, totalDays);
                      return (
                        <ChildBar
                          key={child.id}
                          bar={bar}
                          top={ROOT_BAR_AREA + idx * EXPANDED_CHILD_ROW}
                          height={EXPANDED_CHILD_ROW - 4}
                          expanded
                          onTaskClick={onTaskClick}
                        />
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Unscheduled root tasks */}
      {unscheduledRoots.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border/30">
          <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide mb-1.5">
            未排期任务 ({unscheduledRoots.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unscheduledRoots.map((row) => (
              <button
                key={row.rootTask.id}
                onClick={() => onTaskClick?.(row.rootTask.id)}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors hover:bg-muted/50
                  ${row.rootTask.status === 2 ? "text-muted-foreground/50 line-through border-border/30" : "text-foreground border-border"}`}
              >
                {row.rootTask.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

/** Root task bar (normal size) */
const RootBar = memo(function RootBar({
  bar,
  memberNameMap,
  onTaskClick,
}: {
  bar: BarPosition;
  memberNameMap: Map<string, string>;
  onTaskClick?: (id: string) => void;
}) {
  const { task, leftPct, widthPct, isDiamond } = bar;
  const colorClass = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS[2];
  const borderClass = PRIORITY_BORDER_COLORS[task.priority] ?? PRIORITY_BORDER_COLORS[2];
  const textClass = PRIORITY_TEXT_COLORS[task.priority] ?? PRIORITY_TEXT_COLORS[2];

  return (
    <div
      className={`absolute top-1 h-5 rounded cursor-pointer transition-opacity hover:opacity-90 z-10
        ${isDiamond ? `w-5 rotate-45 border-2 bg-background ${borderClass}` : `${colorClass} opacity-80`}
      `}
      style={{
        left: `${leftPct}%`,
        width: isDiamond ? undefined : `${widthPct}%`,
      }}
      title={`${task.title}${task.start_date ? `\n开始: ${new Date(task.start_date).toLocaleDateString("zh-CN")}` : ""}${task.end_date ? `\n结束: ${new Date(task.end_date).toLocaleDateString("zh-CN")}` : ""}${task.due_date && !task.start_date && !task.end_date ? `\n截止: ${new Date(task.due_date).toLocaleDateString("zh-CN")}` : ""}`}
      onClick={() => onTaskClick?.(task.id)}
    >
      {!isDiamond && task.assignee_email && (
        <span className={`absolute inset-0 flex items-center px-1.5 gap-1 text-[9px] ${textClass} font-medium overflow-hidden`}>
          <span className="flex-shrink-0 w-3.5 h-3.5 rounded-full bg-white/30 flex items-center justify-center text-[8px]">
            {memberNameMap.get(task.assignee_email)?.[0]?.toUpperCase()}
          </span>
          <span className="truncate">{memberNameMap.get(task.assignee_email)}</span>
        </span>
      )}
    </div>
  );
});

/** Child task bar (thinner, more transparent) */
const ChildBar = memo(function ChildBar({
  bar,
  top,
  height,
  expanded,
  onTaskClick,
}: {
  bar: BarPosition;
  top: number;
  height: number;
  expanded?: boolean;
  onTaskClick?: (id: string) => void;
}) {
  const { task, leftPct, widthPct, isDiamond } = bar;
  const colorClass = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS[2];
  const borderClass = PRIORITY_BORDER_COLORS[task.priority] ?? PRIORITY_BORDER_COLORS[2];

  return (
    <div
      className={`absolute rounded-sm cursor-pointer transition-opacity hover:opacity-70 z-10
        ${isDiamond ? `w-3 rotate-45 border bg-background ${borderClass}` : `${colorClass} ${expanded ? "opacity-60" : "opacity-40"}`}
      `}
      style={{
        left: `${leftPct}%`,
        width: isDiamond ? undefined : `${widthPct}%`,
        top: top + 2,
        height,
      }}
      title={`${task.title}${task.start_date ? `\n开始: ${new Date(task.start_date).toLocaleDateString("zh-CN")}` : ""}${task.end_date ? `\n结束: ${new Date(task.end_date).toLocaleDateString("zh-CN")}` : ""}${task.due_date && !task.start_date && !task.end_date ? `\n截止: ${new Date(task.due_date).toLocaleDateString("zh-CN")}` : ""}`}
      onClick={() => onTaskClick?.(task.id)}
    >
      {expanded && !isDiamond && (
        <span className="absolute inset-0 flex items-center px-1 text-[9px] text-white/80 font-medium overflow-hidden truncate">
          {task.title}
        </span>
      )}
    </div>
  );
});
