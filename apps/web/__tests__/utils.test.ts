import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    const isHidden = false;
    expect(cn("base", isHidden && "hidden", "visible")).toBe("base visible");
  });

  it("merges conflicting Tailwind classes (last wins)", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
  });

  it("handles undefined and null inputs", () => {
    expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
  });

  it("returns empty string for no inputs", () => {
    expect(cn()).toBe("");
  });
});
