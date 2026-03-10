"use client";

import { useState, useEffect } from "react";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notification-types";
import type { NotificationPrefs } from "@/lib/types";

const CATEGORIES = [
  {
    key: "task",
    label: "任务相关",
    types: ["task_assigned", "task_mentioned", "task_completed", "task_deleted", "task_reassigned", "task_log_added"] as NotificationType[],
  },
  {
    key: "space",
    label: "空间相关",
    types: ["space_join_pending", "space_member_approved", "space_member_removed"] as NotificationType[],
  },
  {
    key: "digest",
    label: "每日摘要",
    types: ["daily_digest"] as NotificationType[],
  },
];

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/notifications/prefs")
      .then((r) => r.json())
      .then(setPrefs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function togglePref(type: string, channel: "inapp" | "email") {
    if (!prefs) return;
    const next = { ...prefs };
    next[type] = { ...next[type], [channel]: !next[type]?.[channel] };
    setPrefs(next);

    setSaving(true);
    try {
      await fetch("/api/notifications/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
    } catch {
      // revert on error
      setPrefs(prefs);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-xs text-muted-foreground">加载中...</p>;
  }

  if (!prefs) return null;

  return (
    <div className="space-y-6">
      {CATEGORIES.map((cat) => (
        <div key={cat.key}>
          <h3 className="text-xs font-medium text-muted-foreground mb-2">{cat.label}</h3>
          <div className="space-y-1">
            {cat.types.map((type) => {
              const def = NOTIFICATION_TYPES[type];
              const pref = prefs[type] ?? { inapp: def.defaultInapp, email: def.defaultEmail };
              const isDigest = type === "daily_digest";

              return (
                <div key={type} className="flex items-center justify-between py-1.5">
                  <span className="text-sm">{def.label}</span>
                  <div className="flex items-center gap-3">
                    {!isDigest && (
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pref.inapp}
                          onChange={() => togglePref(type, "inapp")}
                          disabled={saving}
                          className="w-3.5 h-3.5 rounded accent-sage"
                        />
                        <span className="text-xs text-muted-foreground">应用内</span>
                      </label>
                    )}
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pref.email}
                        onChange={() => togglePref(type, "email")}
                        disabled={saving}
                        className="w-3.5 h-3.5 rounded accent-sage"
                      />
                      <span className="text-xs text-muted-foreground">邮件</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
