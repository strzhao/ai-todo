"use client";

import { useRef, useEffect, useCallback } from "react";

const STORAGE_KEY = "sidebar-width";
const MIN_WIDTH = 160;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 208;
const CSS_VAR = "--sidebar-width";

function clamp(min: number, val: number, max: number) {
  return Math.min(max, Math.max(min, val));
}

export function useSidebarResize() {
  const handleRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(DEFAULT_WIDTH);
  const dragListenersRef = useRef<{ move: (e: MouseEvent) => void; up: () => void } | null>(null);

  const setWidth = useCallback((w: number) => {
    widthRef.current = w;
    document.documentElement.style.setProperty(CSS_VAR, `${w}px`);
  }, []);

  const cleanupDrag = useCallback(() => {
    const listeners = dragListenersRef.current;
    if (!listeners) return;
    document.removeEventListener("mousemove", listeners.move);
    document.removeEventListener("mouseup", listeners.up);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    dragListenersRef.current = null;
  }, []);

  useEffect(() => {
    // Restore persisted width
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) setWidth(clamp(MIN_WIDTH, parsed, MAX_WIDTH));
    }

    const handle = handleRef.current;
    if (!handle) return;

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMouseMove = (e: MouseEvent) => {
        setWidth(clamp(MIN_WIDTH, e.clientX, MAX_WIDTH));
      };

      const onMouseUp = () => {
        cleanupDrag();
        localStorage.setItem(STORAGE_KEY, String(widthRef.current));
      };

      dragListenersRef.current = { move: onMouseMove, up: onMouseUp };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    const onDblClick = () => {
      setWidth(DEFAULT_WIDTH);
      localStorage.setItem(STORAGE_KEY, String(DEFAULT_WIDTH));
    };

    handle.addEventListener("mousedown", onMouseDown);
    handle.addEventListener("dblclick", onDblClick);

    return () => {
      handle.removeEventListener("mousedown", onMouseDown);
      handle.removeEventListener("dblclick", onDblClick);
      cleanupDrag();
    };
  }, [setWidth, cleanupDrag]);

  return { handleRef };
}
