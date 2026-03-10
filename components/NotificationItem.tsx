"use client";

import type { AppNotification } from "@/lib/types";

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return new Date(dateStr).toLocaleDateString("zh-CN");
}

function getTypeIcon(type: string): string {
  switch (type) {
    case "task_assigned": return "📌";
    case "task_mentioned": return "@";
    case "task_reassigned": return "🔄";
    case "task_completed": return "✅";
    case "task_deleted": return "🗑";
    case "task_log_added": return "📝";
    case "space_join_pending": return "🙋";
    case "space_member_approved": return "🎉";
    case "space_member_removed": return "👋";
    case "daily_digest": return "📊";
    default: return "🔔";
  }
}

interface Props {
  notification: AppNotification;
  onClick?: (n: AppNotification) => void;
}

export function NotificationItem({ notification, onClick }: Props) {
  const n = notification;

  return (
    <button
      onClick={() => onClick?.(n)}
      className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/60 transition-colors ${
        n.read ? "opacity-60" : ""
      }`}
    >
      <span className="text-sm shrink-0 mt-0.5 w-5 text-center">{getTypeIcon(n.type)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-snug">{n.title}</p>
        {n.body && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.body}</p>
        )}
        <p className="text-xs text-muted-foreground/60 mt-1">{getTimeAgo(n.created_at)}</p>
      </div>
      {!n.read && (
        <span className="w-2 h-2 rounded-full bg-info shrink-0 mt-2" />
      )}
    </button>
  );
}
