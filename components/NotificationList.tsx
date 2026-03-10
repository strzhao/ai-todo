"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { NotificationItem } from "./NotificationItem";
import type { AppNotification } from "@/lib/types";

interface Props {
  onClose?: () => void;
  /** Whether this is rendered inside a popover (compact) or full page */
  compact?: boolean;
}

export function NotificationList({ onClose, compact }: Props) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

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
    // Mark as read
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
    // Navigate
    if (n.space_id && n.task_id) {
      router.push(`/spaces/${n.space_id}?focus=${n.task_id}`);
    } else if (n.space_id) {
      router.push(`/spaces/${n.space_id}`);
    } else {
      router.push("/");
    }
    onClose?.();
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
          <NotificationItem key={n.id} notification={n} onClick={handleClick} />
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
    </div>
  );
}
