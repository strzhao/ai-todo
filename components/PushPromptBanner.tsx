"use client";

import { useState, useEffect } from "react";
import { isPushSupported, subscribeToPush, isCurrentlySubscribed } from "@/lib/use-push";

const DISMISS_KEY = "push_prompt_dismissed_at";
const VISIT_KEY = "push_prompt_visit_count";
const DISMISS_DAYS = 7;
const MIN_VISITS = 3;

export function PushPromptBanner() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!isPushSupported()) return;
      if (Notification.permission === "denied") return;

      const subscribed = await isCurrentlySubscribed();
      if (subscribed) return;

      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (dismissed) {
        const elapsed = Date.now() - Number(dismissed);
        if (elapsed < DISMISS_DAYS * 86400000) return;
      }

      const visits = Number(localStorage.getItem(VISIT_KEY) || "0") + 1;
      localStorage.setItem(VISIT_KEY, String(visits));
      if (visits < MIN_VISITS) return;

      setVisible(true);
    })();
  }, []);

  if (!visible) return null;

  async function handleEnable() {
    setLoading(true);
    const ok = await subscribeToPush();
    setLoading(false);
    if (ok) setVisible(false);
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }

  return (
    <div className="mx-4 mt-3 mb-1 p-3 bg-sage-mist rounded-lg flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg shrink-0" aria-hidden>&#x1F514;</span>
        <span className="text-sm text-foreground">开启推送通知，及时收到任务提醒</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleDismiss}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          以后再说
        </button>
        <button
          onClick={handleEnable}
          disabled={loading}
          className="text-xs text-white bg-sage hover:bg-sage-light px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
        >
          {loading ? "开启中..." : "开启"}
        </button>
      </div>
    </div>
  );
}
