import { describe, it, expect } from "vitest";
import { daysBetween, addDays, getMemberName } from "@/lib/gantt-utils";
import type { SpaceMember } from "@/lib/types";

function makeMember(email: string, displayName?: string | null): SpaceMember {
  return {
    user_id: email,
    email,
    display_name: displayName ?? null,
    status: "active",
    role: "member",
    joined_at: "2026-01-01T00:00:00Z",
  };
}

describe("daysBetween", () => {
  it("同一天返回 0", () => {
    const d = new Date("2026-03-15T00:00:00Z");
    expect(daysBetween(d, d)).toBe(0);
  });

  it("相差 1 天（正向）", () => {
    const a = new Date("2026-03-15T00:00:00Z");
    const b = new Date("2026-03-16T00:00:00Z");
    expect(daysBetween(a, b)).toBeCloseTo(1, 5);
  });

  it("b < a 返回负数", () => {
    const a = new Date("2026-03-16T00:00:00Z");
    const b = new Date("2026-03-15T00:00:00Z");
    expect(daysBetween(a, b)).toBeLessThan(0);
    expect(daysBetween(a, b)).toBeCloseTo(-1, 5);
  });

  it("相差 0.5 天（12小时）", () => {
    const a = new Date("2026-03-15T00:00:00Z");
    const b = new Date("2026-03-15T12:00:00Z");
    expect(daysBetween(a, b)).toBeCloseTo(0.5, 5);
  });

  it("跨月计算正确（1月31日到3月1日 = 29天，2026年非闰年）", () => {
    const a = new Date("2026-01-31T00:00:00Z");
    const b = new Date("2026-03-01T00:00:00Z");
    expect(daysBetween(a, b)).toBeCloseTo(29, 0);
  });
});

describe("addDays", () => {
  it("加 1 天", () => {
    const d = new Date("2026-03-15T00:00:00Z");
    const result = addDays(d, 1);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-16");
  });

  it("加负数（向前推 1 天）", () => {
    const d = new Date("2026-03-15T00:00:00Z");
    const result = addDays(d, -1);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-14");
  });

  it("12月31日加 1 天 = 1月1日（跨年）", () => {
    const d = new Date("2026-12-31T00:00:00Z");
    const result = addDays(d, 1);
    expect(result.toISOString().slice(0, 10)).toBe("2027-01-01");
  });

  it("加 0 不改变日期但返回新对象", () => {
    const d = new Date("2026-03-15T00:00:00Z");
    const result = addDays(d, 0);
    expect(result.getTime()).toBe(d.getTime());
    expect(result).not.toBe(d);
  });

  it("不修改原始 Date 对象", () => {
    const d = new Date("2026-03-15T00:00:00Z");
    const original = d.getTime();
    addDays(d, 7);
    expect(d.getTime()).toBe(original);
  });
});

describe("getMemberName", () => {
  it("有 display_name → 返回 display_name", () => {
    const members = [makeMember("alice@example.com", "Alice")];
    expect(getMemberName("alice@example.com", members)).toBe("Alice");
  });

  it("display_name 为 null → 返回邮箱前缀", () => {
    const members = [makeMember("alice@example.com", null)];
    expect(getMemberName("alice@example.com", members)).toBe("alice");
  });

  it("members 为空 → 返回邮箱前缀", () => {
    expect(getMemberName("alice@example.com", [])).toBe("alice");
  });

  it("未找到匹配成员 → 返回邮箱前缀", () => {
    const members = [makeMember("bob@example.com", "Bob")];
    expect(getMemberName("alice@example.com", members)).toBe("alice");
  });

  it("邮箱无 @ 符号 → 返回整个字符串", () => {
    expect(getMemberName("noemail", [])).toBe("noemail");
  });

  it("display_name 为空字符串 → 返回邮箱前缀（falsy 兜底）", () => {
    const members = [makeMember("alice@example.com", "")];
    expect(getMemberName("alice@example.com", members)).toBe("alice");
  });
});
