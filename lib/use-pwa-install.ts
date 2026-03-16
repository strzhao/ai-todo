"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type PWAPlatform = "chromium" | "ios" | "unsupported";

export interface PWAInstallState {
  canPrompt: boolean;
  isStandalone: boolean;
  platform: PWAPlatform;
  promptInstall: () => Promise<boolean>;
}

function getIsStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as never as { standalone?: boolean }).standalone === true
  );
}

function getIsIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function getIsChromium(): boolean {
  if (typeof navigator === "undefined") return false;
  // All Chromium browsers (Chrome, Edge, Opera, Brave) have "Chrome/" in UA
  return /Chrome\//.test(navigator.userAgent);
}

export function usePWAInstall(): PWAInstallState {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [isStandalone] = useState(getIsStandalone);

  useEffect(() => {
    function handleBeforeInstall(e: Event) {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setCanPrompt(true);
    }

    function handleAppInstalled() {
      deferredPrompt.current = null;
      setCanPrompt(false);
      try {
        localStorage.setItem("pwa_installed", "true");
      } catch { /* noop */ }
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    const prompt = deferredPrompt.current;
    if (!prompt) return false;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      deferredPrompt.current = null;
      setCanPrompt(false);
      return true;
    }
    return false;
  }, []);

  const platform: PWAPlatform = canPrompt
    ? "chromium"
    : getIsIOS()
      ? "ios"
      : getIsChromium()
        ? "chromium"
        : "unsupported";

  return { canPrompt, isStandalone, platform, promptInstall };
}
