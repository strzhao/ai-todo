"use client";

import { useState, useEffect } from "react";

/**
 * Returns true when viewport width >= 768px (md breakpoint).
 * SSR-safe: defaults to false, updates on mount and resize.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mql.matches);

    function onChange(e: MediaQueryListEvent) {
      setIsDesktop(e.matches);
    }

    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}
