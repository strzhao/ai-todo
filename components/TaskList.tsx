"use client";

import { useState, useMemo } from "react";
import { TaskItem } from "./TaskItem";
import { TaskDetail } from "./TaskDetail";
import { TaskSkeleton } from "./TaskSkeleton";
import { EmptyState } from "./EmptyState";
import type { Task, TaskMember } from "@/lib/types";
import { buildTree, type TaskNode } from "@/lib/task-utils";

function CompletedTaskNode({
  node,
  expandedCompletedId,
  setExpandedCompletedId,
  currentUserEmail,
  members,
  onReopen,
  depth = 0,
}: {
  node: TaskNode;
  expandedCompletedId: string | null;
  setExpandedCompletedId: (id: string | null) => void;
  currentUserEmail?: string;
  members?: TaskMember[];
  onReopen?: (id: string) => void;
  depth?: number;
}) {
  const [reopening, setReopening] = useState(false);
  const isExpanded = expandedCompletedId === node.id;

  async function handleReopen(e: React.MouseEvent) {
    e.stopPropagation();
    if (reopening || !onReopen) return;
    setReopening(true);
    try {
      const res = await fetch(`/api/tasks/${node.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reopen: true }),
      });
      if (res.ok) {
        onReopen(node.id);
      }
    } finally {
      setReopening(false);
    }
  }

  return (
    <div style={depth > 0 ? { paddingLeft: `${depth * 1.75}rem` } : undefined}>
      <div
        onClick={() => setExpandedCompletedId(isExpanded ? null : node.id)}
        className="flex items-start gap-3 py-2 px-1 border-b last:border-0 border-border/30 cursor-pointer hover:bg-muted/30 transition-colors"
      >
        <div className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-muted-foreground/20 flex items-center justify-center">
          <span className="text-[8px] text-muted-foreground">✓</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm line-through text-muted-foreground truncate">{node.title}</p>
          {node.completed_at && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
              {new Date(node.completed_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        {onReopen && (
          <button
            onClick={handleReopen}
            disabled={reopening}
            className="text-[10px] px-2 py-0.5 rounded border border-sage/30 text-sage hover:bg-sage/10 disabled:opacity-40 transition-colors flex-shrink-0 mt-0.5"
          >
            {reopening ? "..." : "重新打开"}
          </button>
        )}
        <span className="text-[10px] text-muted-foreground/40 mt-1 flex-shrink-0">{isExpanded ? "▲" : "▼"}</span>
      </div>
      {isExpanded && (
        <div className="mx-1 mb-2 mt-1 border border-border/40 rounded-lg bg-muted/20 overflow-hidden">
          <TaskDetail task={node} currentUserEmail={currentUserEmail} members={members} readonly mode="embedded" />
        </div>
      )}
      {node.subtasks.length > 0 &&
        node.subtasks.map((sub) => (
          <CompletedTaskNode
            key={sub.id}
            node={sub}
            expandedCompletedId={expandedCompletedId}
            setExpandedCompletedId={setExpandedCompletedId}
            currentUserEmail={currentUserEmail}
            members={members}
            onReopen={onReopen}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

interface Props {
  tasks: Task[];
  completedTasks?: Task[];
  loading?: boolean;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<Task>) => void;
  onReopen?: (id: string) => void;
  emptyText?: string;
  emptySubtext?: string;
  currentUserEmail?: string;
  highlightTodayDue?: boolean;
  groupPinnedAtBottom?: boolean;
  pinnedSectionDefaultCollapsed?: boolean;
  pinnedSectionTitle?: string;
  members?: TaskMember[];
  onDrillDown?: (taskId: string) => void;
  childCountMap?: Record<string, number>;
}

export function TaskList({
  tasks,
  completedTasks,
  loading,
  onComplete,
  onDelete,
  onUpdate,
  onReopen,
  emptyText = "暂无任务",
  emptySubtext,
  currentUserEmail,
  highlightTodayDue = false,
  groupPinnedAtBottom = false,
  pinnedSectionDefaultCollapsed = false,
  pinnedSectionTitle = "置顶任务",
  members,
  onDrillDown,
  childCountMap,
}: Props) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [expandedCompletedId, setExpandedCompletedId] = useState<string | null>(null);
  const [showPinned, setShowPinned] = useState(!pinnedSectionDefaultCollapsed);
  const tree = useMemo(() => buildTree(tasks), [tasks]);
  const completedTree = useMemo(() => (showCompleted && completedTasks ? buildTree(completedTasks) : []), [showCompleted, completedTasks]);

  if (loading) return <TaskSkeleton />;

  if (tasks.length === 0 && !completedTasks?.length) {
    return <EmptyState text={emptyText} subtext={emptySubtext} />;
  }

  const regularRoots = groupPinnedAtBottom ? tree.filter((node) => !node.pinned) : tree;
  const pinnedRoots = groupPinnedAtBottom ? tree.filter((node) => node.pinned) : [];

  return (
    <div>
      {regularRoots.map((node) => (
        <TaskItem
          key={node.id}
          task={node}
          subtasks={node.subtasks}
          onComplete={onComplete}
          onDelete={onDelete}
          onUpdate={onUpdate}
          currentUserEmail={currentUserEmail}
          highlightTodayDue={highlightTodayDue}
          members={members}
          onDrillDown={onDrillDown}
          childCountMap={childCountMap}
        />
      ))}

      {/* Pinned tasks section (bottom of active tasks) */}
      {groupPinnedAtBottom && pinnedRoots.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowPinned((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            <span className="text-[10px]">{showPinned ? "▼" : "▶"}</span>
            <span>{pinnedSectionTitle} ({pinnedRoots.length})</span>
          </button>

          {showPinned && (
            <div className="mt-1 border-t border-border/30 pt-1">
              {pinnedRoots.map((node) => (
                <TaskItem
                  key={node.id}
                  task={node}
                  subtasks={node.subtasks}
                  onComplete={onComplete}
                  onDelete={onDelete}
                  onUpdate={onUpdate}
                  currentUserEmail={currentUserEmail}
                  highlightTodayDue={highlightTodayDue}
                  members={members}
                  onDrillDown={onDrillDown}
                  childCountMap={childCountMap}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Completed tasks section */}
      {completedTasks && completedTasks.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            <span className="text-[10px]">{showCompleted ? "▼" : "▶"}</span>
            <span>已完成 ({completedTasks!.length})</span>
          </button>

          {showCompleted && (
            <div className="mt-1 opacity-60">
              {completedTree.map((node) => (
                <CompletedTaskNode
                  key={node.id}
                  node={node}
                  expandedCompletedId={expandedCompletedId}
                  setExpandedCompletedId={setExpandedCompletedId}
                  currentUserEmail={currentUserEmail}
                  members={members}
                  onReopen={onReopen}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
