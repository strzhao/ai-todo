"use client";

import { useState, useEffect, useCallback } from "react";
import { usePWAInstall } from "@/lib/use-pwa-install";

const DISMISS_KEY = "pwa_install_dismissed_at";
const VISIT_KEY = "pwa_install_visit_count";
const INSTALLED_KEY = "pwa_installed";
const DISMISS_DAYS = 7;
const MIN_VISITS = 5;

export function PWAInstallBanner() {
  const { canPrompt, isStandalone, platform, promptInstall } = usePWAInstall();
  const [visible, setVisible] = useState(false);
  const [pushBannerVisible, setPushBannerVisible] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [closing, setClosing] = useState(false);

  // Listen for PushPromptBanner visibility to avoid showing both banners
  useEffect(() => {
    function handler(e: Event) {
      setPushBannerVisible((e as CustomEvent<boolean>).detail);
    }
    window.addEventListener("push-banner-visible", handler);
    return () => window.removeEventListener("push-banner-visible", handler);
  }, []);

  // Check visibility conditions
  useEffect(() => {
    if (isStandalone) return;
    if (platform === "unsupported") return;

    try {
      if (localStorage.getItem(INSTALLED_KEY) === "true") return;

      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (dismissed) {
        const elapsed = Date.now() - Number(dismissed);
        if (elapsed < DISMISS_DAYS * 86400000) return;
      }

      const visits = Number(localStorage.getItem(VISIT_KEY) || "0") + 1;
      localStorage.setItem(VISIT_KEY, String(visits));
      if (visits < MIN_VISITS) return;

      setVisible(true);
    } catch { /* localStorage unavailable */ }
  }, [isStandalone, platform]);

  const animateClose = useCallback((cb?: () => void) => {
    setClosing(true);
    setTimeout(() => {
      setVisible(false);
      setClosing(false);
      cb?.();
    }, 200);
  }, []);

  function handleDismiss() {
    animateClose(() => {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* noop */ }
    });
  }

  async function handleInstall() {
    if (canPrompt) {
      const accepted = await promptInstall();
      if (accepted) {
        animateClose();
      } else {
        handleDismiss();
      }
    }
  }

  if (!visible || pushBannerVisible) return null;

  const isIOS = platform === "ios";
  // Chromium without native prompt — show manual steps
  const needsManualSteps = isIOS || (platform === "chromium" && !canPrompt);

  return (
    <div
      className={`fixed z-20 transition-all duration-200 ${
        closing
          ? "translate-y-4 opacity-0"
          : "translate-y-0 opacity-100 animate-in slide-in-from-bottom-4 fade-in duration-300"
      } bottom-[68px] left-4 right-4 md:bottom-6 md:right-6 md:left-auto md:w-[360px]`}
    >
      <div className="bg-popover rounded-xl shadow-lg border border-black/5 dark:border-white/10 p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0 mt-0.5" aria-hidden>📲</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">添加到主屏幕</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              像原生应用一样使用 AI Todo，启动更快、体验更好
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 p-1 -mt-1 -mr-1 text-muted-foreground hover:text-foreground transition-colors rounded-md"
            aria-label="关闭"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Step-by-step guide (iOS or Chromium without native prompt) */}
        {needsManualSteps && showSteps && (
          <div className="mt-3 space-y-2 text-xs text-foreground bg-sage-mist rounded-lg p-3">
            {isIOS ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-sage text-white text-xs flex items-center justify-center font-medium">1</span>
                  <span>
                    点击底部工具栏的{" "}
                    <IOSShareIcon className="inline-block align-text-bottom mx-0.5" />
                    {" "}分享按钮
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-sage text-white text-xs flex items-center justify-center font-medium">2</span>
                  <span>向下滑动，选择「添加到主屏幕」</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-sage text-white text-xs flex items-center justify-center font-medium">3</span>
                  <span>点击右上角「添加」即可</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-sage text-white text-xs flex items-center justify-center font-medium">1</span>
                  <span>点击地址栏右侧的 <strong>安装</strong> 图标（或浏览器菜单 ⋮）</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-sage text-white text-xs flex items-center justify-center font-medium">2</span>
                  <span>选择「安装 AI Todo」或「将此站点作为应用安装」</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-3 flex gap-2">
          {needsManualSteps ? (
            showSteps ? (
              <button
                onClick={handleDismiss}
                className="flex-1 text-sm text-white bg-sage hover:bg-sage-light px-4 py-2 rounded-lg transition-colors font-medium"
              >
                知道了
              </button>
            ) : (
              <>
                <button
                  onClick={handleDismiss}
                  className="text-sm text-muted-foreground hover:text-foreground px-3 py-2 transition-colors"
                >
                  以后再说
                </button>
                <button
                  onClick={() => setShowSteps(true)}
                  className="flex-1 text-sm text-white bg-sage hover:bg-sage-light px-4 py-2 rounded-lg transition-colors font-medium"
                >
                  查看步骤
                </button>
              </>
            )
          ) : (
            <>
              <button
                onClick={handleDismiss}
                className="text-sm text-muted-foreground hover:text-foreground px-3 py-2 transition-colors"
              >
                以后再说
              </button>
              <button
                onClick={handleInstall}
                className="flex-1 text-sm text-white bg-sage hover:bg-sage-light px-4 py-2 rounded-lg transition-colors font-medium"
              >
                安装应用
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** iOS Safari share icon (box with up arrow) */
function IOSShareIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}
