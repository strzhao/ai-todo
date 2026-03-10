"use client";

import { useState, useRef, useEffect } from "react";
import { useUnreadCount } from "@/lib/use-notifications";
import { NotificationList } from "./NotificationList";

export function NotificationBell() {
  const { count, refresh } = useUnreadCount();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) refresh();
        }}
        className="flex items-center gap-2 px-3 py-2 w-full rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <span className="flex-1 text-left">通知</span>
        {count > 0 && (
          <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-white text-[10px] font-medium px-1 shrink-0">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 z-50 bg-popover border border-border rounded-lg shadow-lg">
          <NotificationList
            compact
            onClose={() => {
              setOpen(false);
              refresh();
            }}
          />
        </div>
      )}
    </div>
  );
}
