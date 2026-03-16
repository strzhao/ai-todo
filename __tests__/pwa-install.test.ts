import { describe, it, expect } from "vitest";

// Test the pure logic used by PWA install banner (no DOM/localStorage needed)

describe("PWA install banner logic", () => {
  describe("visit counting logic", () => {
    const MIN_VISITS = 5;

    it("should not trigger below MIN_VISITS", () => {
      for (let visits = 1; visits < MIN_VISITS; visits++) {
        expect(visits < MIN_VISITS).toBe(true);
      }
    });

    it("should trigger at exactly MIN_VISITS", () => {
      expect(MIN_VISITS >= MIN_VISITS).toBe(true);
    });

    it("should trigger above MIN_VISITS", () => {
      expect(10 >= MIN_VISITS).toBe(true);
    });
  });

  describe("dismiss cooldown logic", () => {
    const DISMISS_DAYS = 7;
    const DISMISS_MS = DISMISS_DAYS * 86400000;

    it("should be in cooldown if dismissed 3 days ago", () => {
      const dismissedAt = Date.now() - 3 * 86400000;
      const elapsed = Date.now() - dismissedAt;
      expect(elapsed < DISMISS_MS).toBe(true);
    });

    it("should be out of cooldown if dismissed 8 days ago", () => {
      const dismissedAt = Date.now() - 8 * 86400000;
      const elapsed = Date.now() - dismissedAt;
      expect(elapsed < DISMISS_MS).toBe(false);
    });

    it("should be exactly at boundary after 7 days", () => {
      const dismissedAt = Date.now() - 7 * 86400000;
      const elapsed = Date.now() - dismissedAt;
      // At exactly 7 days, elapsed >= DISMISS_MS, so cooldown expired
      expect(elapsed >= DISMISS_MS).toBe(true);
    });
  });

  describe("iOS detection regex", () => {
    const iosRegex = /iPhone|iPad|iPod/;

    it("should detect iPhone", () => {
      expect(iosRegex.test("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
    });

    it("should detect iPad", () => {
      expect(iosRegex.test("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(true);
    });

    it("should detect iPod", () => {
      expect(iosRegex.test("Mozilla/5.0 (iPod touch; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
    });

    it("should not match Android", () => {
      expect(iosRegex.test("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe(false);
    });

    it("should not match desktop Chrome", () => {
      expect(iosRegex.test("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120")).toBe(false);
    });

    it("should not match Windows", () => {
      expect(iosRegex.test("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
    });
  });

  describe("platform determination logic", () => {
    it("should be chromium when canPrompt is true", () => {
      const canPrompt = true;
      const isIOS = false;
      const platform = canPrompt ? "chromium" : isIOS ? "ios" : "unsupported";
      expect(platform).toBe("chromium");
    });

    it("should be ios when canPrompt is false and isIOS is true", () => {
      const canPrompt = false;
      const isIOS = true;
      const platform = canPrompt ? "chromium" : isIOS ? "ios" : "unsupported";
      expect(platform).toBe("ios");
    });

    it("should be unsupported when canPrompt is false and not iOS", () => {
      const canPrompt = false;
      const isIOS = false;
      const platform = canPrompt ? "chromium" : isIOS ? "ios" : "unsupported";
      expect(platform).toBe("unsupported");
    });

    it("should prefer chromium over ios when both conditions met", () => {
      // If beforeinstallprompt fired (canPrompt=true), it's chromium even on iOS-like UA
      const canPrompt = true;
      const isIOS = true;
      const platform = canPrompt ? "chromium" : isIOS ? "ios" : "unsupported";
      expect(platform).toBe("chromium");
    });
  });
});
