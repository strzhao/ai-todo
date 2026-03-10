"use client";

import { useState, useEffect, useCallback } from "react";

export function useUnreadCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    fetch("/api/notifications/unread-count")
      .then((r) => r.json())
      .then((d) => setCount(d.count ?? 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30_000);
    const onTasksChanged = () => refresh();
    window.addEventListener("tasks-changed", onTasksChanged);
    return () => {
      clearInterval(timer);
      window.removeEventListener("tasks-changed", onTasksChanged);
    };
  }, [refresh]);

  return { count, refresh };
}
