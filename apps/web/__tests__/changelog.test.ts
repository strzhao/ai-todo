import { describe, it, expect } from "vitest";
import { getLatestVersion, hasNewUpdate, changelog } from "@/lib/changelog";

describe("getLatestVersion", () => {
  it("returns the first entry version", () => {
    expect(getLatestVersion()).toBe(changelog[0].version);
  });

  it("returns a semver-like string", () => {
    expect(getLatestVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("hasNewUpdate", () => {
  it("returns true when lastSeenVersion is null", () => {
    expect(hasNewUpdate(null)).toBe(true);
  });

  it("returns false when lastSeenVersion matches latest", () => {
    expect(hasNewUpdate(getLatestVersion())).toBe(false);
  });

  it("returns true when lastSeenVersion differs", () => {
    expect(hasNewUpdate("0.0.0")).toBe(true);
  });
});
