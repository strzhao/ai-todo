import { describe, it, expect } from "vitest";
import { getDisplayLabel } from "@/lib/display-utils";

describe("getDisplayLabel", () => {
  it("returns display_name when available", () => {
    expect(getDisplayLabel("user@example.com", { display_name: "Alice", nickname: "ali" })).toBe("Alice");
  });

  it("falls back to nickname when display_name is absent", () => {
    expect(getDisplayLabel("user@example.com", { nickname: "ali" })).toBe("ali");
  });

  it("falls back to email local part when no member info", () => {
    expect(getDisplayLabel("user@example.com")).toBe("user");
  });

  it("falls back to email local part when member has no names", () => {
    expect(getDisplayLabel("user@example.com", {})).toBe("user");
  });

  it("falls back to email local part when display_name and nickname are empty strings", () => {
    expect(getDisplayLabel("user@example.com", { display_name: "", nickname: "" })).toBe("user");
  });
});
