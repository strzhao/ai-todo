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

function ToggleSwitch({ checked, onChange, disabled, label }: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        disabled={disabled}
        className={`
          relative inline-flex h-5 w-9 shrink-0 rounded-full
          transition-colors duration-200 ease-in-out
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage
          disabled:opacity-50 disabled:cursor-not-allowed
          ${checked ? 'bg-sage' : 'bg-muted'}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm
            transform transition-transform duration-200 ease-in-out mt-0.5
            ${checked ? 'translate-x-4' : 'translate-x-0.5'}
          `}
        />
      </button>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

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
    const prev = prefs;
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
      setPrefs(prev);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 px-4 py-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center justify-between">
            <div className="h-4 w-28 bg-muted rounded animate-pulse" />
            <div className="flex gap-4">
              <div className="h-5 w-9 bg-muted rounded-full animate-pulse" />
              <div className="h-5 w-9 bg-muted rounded-full animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!prefs) return null;

  return (
    <div>
      {CATEGORIES.map((cat, catIdx) => (
        <div key={cat.key}>
          <div className={`px-4 pb-1 ${catIdx === 0 ? 'pt-2' : 'pt-3'}`}>
            <span className="text-xs font-medium text-muted-foreground">{cat.label}</span>
          </div>
          {cat.types.map((type) => {
            const def = NOTIFICATION_TYPES[type];
            const pref = prefs[type] ?? { inapp: def.defaultInapp, email: def.defaultEmail };
            const isDigest = type === "daily_digest";

            return (
              <div key={type} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-foreground">{def.label}</span>
                <div className="flex items-center gap-4">
                  {!isDigest && (
                    <ToggleSwitch
                      checked={pref.inapp}
                      onChange={() => togglePref(type, "inapp")}
                      disabled={saving}
                      label="应用内"
                    />
                  )}
                  <ToggleSwitch
                    checked={pref.email}
                    onChange={() => togglePref(type, "email")}
                    disabled={saving}
                    label="邮件"
                  />
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
