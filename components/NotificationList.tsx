"use client";

import { useState, useEffect, useCallback } from "react";
import { NotificationItem } from "./NotificationItem";
import { TaskDetail } from "./TaskDetail";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { AppNotification, Task } from "@/lib/types";

interface Props {
  onClose?: () => void;
  /** Whether this is rendered inside a popover (compact) or full page */
  compact?: boolean;
}

export function NotificationList({ onClose, compact }: Props) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchNotifications = useCallback(async (before?: string) => {
    try {
      const url = before
        ? `/api/notifications?limit=20&before=${encodeURIComponent(before)}`
        : "/api/notifications?limit=20";
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) {
        if (before) {
          setNotifications((prev) => [...prev, ...data]);
        } else {
          setNotifications(data);
        }
        setHasMore(data.length >= 20);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAllRead = async () => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    window.dispatchEvent(new CustomEvent("tasks-changed"));
  };

  const handleClick = async (n: AppNotification) => {
    if (!n.read) {
      fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [n.id] }),
      }).catch(() => {});
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, read: true } : item))
      );
      window.dispatchEvent(new CustomEvent("tasks-changed"));
    }
    // 非抽屉展示的通知（Link 导航）需要关闭通知列表
    const isDrawer = !!(n.task_id || n.type === "daily_digest");
    if (!isDrawer) onClose?.();
  };

  const handleOpenDetail = async (n: AppNotification) => {
    setSelectedNotification(n);
    setDetailTask(null);
    if (n.task_id) {
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/tasks/${n.task_id}`);
        if (res.ok) {
          const task = await res.json();
          setDetailTask(task);
        }
      } catch {
        // ignore
      } finally {
        setDetailLoading(false);
      }
    }
  };

  const handleSheetClose = () => {
    setSelectedNotification(null);
    setDetailTask(null);
    setDetailLoading(false);
  };

  const handleTaskUpdate = async (id: string, updates: Partial<Task>) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updated = await res.json();
        setDetailTask((prev) => (prev?.id === id ? { ...prev, ...updated } : prev));
        window.dispatchEvent(new CustomEvent("tasks-changed"));
      }
    } catch {
      // ignore
    }
  };

  const handleTaskComplete = async (id: string) => {
    try {
      await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complete: true }),
      });
      window.dispatchEvent(new CustomEvent("tasks-changed"));
      handleSheetClose();
    } catch {
      // ignore
    }
  };

  const handleTaskDelete = async (id: string) => {
    try {
      await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      window.dispatchEvent(new CustomEvent("tasks-changed"));
      handleSheetClose();
    } catch {
      // ignore
    }
  };

  const handleLoadMore = () => {
    const last = notifications[notifications.length - 1];
    if (last) fetchNotifications(last.created_at);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const maxH = compact ? "max-h-[400px]" : "";

  return (
    <div className={compact ? "w-[360px]" : ""}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <h3 className="text-sm font-medium text-foreground">通知</h3>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="text-xs text-info hover:text-info/80 transition-colors"
          >
            全部已读
          </button>
        )}
      </div>

      <div className={`overflow-y-auto ${maxH}`}>
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          </div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">暂无通知</p>
          </div>
        )}

        {notifications.map((n) => (
          <NotificationItem
            key={n.id}
            notification={n}
            onClick={handleClick}
            onOpenDetail={handleOpenDetail}
          />
        ))}

        {hasMore && !loading && (
          <button
            onClick={handleLoadMore}
            className="w-full py-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            加载更多
          </button>
        )}
      </div>

      <Sheet open={!!selectedNotification} onOpenChange={(open) => { if (!open) handleSheetClose(); }}>
        <SheetContent>
          <SheetHeader className="sr-only">
            <SheetTitle>详情</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            {/* 任务详情 */}
            {selectedNotification?.task_id && detailLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
              </div>
            )}
            {selectedNotification?.task_id && !detailLoading && detailTask && (
              <TaskDetail
                task={detailTask}
                mode="standalone"
                readonly={detailTask.status === 2}
                onUpdate={handleTaskUpdate}
                onComplete={handleTaskComplete}
                onDelete={handleTaskDelete}
              />
            )}
            {selectedNotification?.task_id && !detailLoading && !detailTask && (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">任务不存在或无权访问</p>
              </div>
            )}
            {/* 每日摘要：展示通知内容 */}
            {selectedNotification?.type === "daily_digest" && !selectedNotification.task_id && (
              <div className="px-1 py-4 space-y-3">
                <h3 className="text-base font-medium text-foreground">{selectedNotification.title}</h3>
                {selectedNotification.body && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {selectedNotification.body}
                  </p>
                )}
                <p className="text-xs text-muted-foreground/60 pt-2">
                  如需查看完整摘要，请前往对应空间页面
                </p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
