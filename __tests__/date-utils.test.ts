import { describe, it, expect } from "vitest";
import {
  toLocalISO,
  isDateOnly,
  isToday,
  isTomorrow,
  formatDateTime,
  formatDateOnly,
  getDefaultTime,
  extractTime,
  extractDate,
  combineDateTimeISO,
  getDaysInMonth,
  getFirstDayOfMonth,
} from "@/lib/date-utils";

describe("toLocalISO", () => {
  it("generates ISO 8601 with local timezone offset", () => {
    const d = new Date(2026, 2, 10, 14, 30, 0); // March 10, 2026 14:30
    const iso = toLocalISO(d);
    expect(iso).toMatch(/^2026-03-10T14:30:00[+-]\d{2}:\d{2}$/);
  });

  it("pads single digits", () => {
    const d = new Date(2026, 0, 5, 9, 5, 0); // Jan 5, 2026 09:05
    const iso = toLocalISO(d);
    expect(iso).toContain("2026-01-05T09:05:00");
  });
});

describe("isDateOnly", () => {
  it("returns true for YYYY-MM-DD", () => {
    expect(isDateOnly("2026-03-10")).toBe(true);
  });

  it("returns false for ISO with time", () => {
    expect(isDateOnly("2026-03-10T14:30:00+08:00")).toBe(false);
  });

  it("returns false for ISO with Z", () => {
    expect(isDateOnly("2026-03-10T06:30:00.000Z")).toBe(false);
  });
});

describe("isToday / isTomorrow", () => {
  it("isToday returns true for today", () => {
    expect(isToday(new Date())).toBe(true);
  });

  it("isToday returns false for yesterday", () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    expect(isToday(d)).toBe(false);
  });

  it("isTomorrow returns true for tomorrow", () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    expect(isTomorrow(d)).toBe(true);
  });
});

describe("formatDateTime", () => {
  it("returns empty for null/undefined", () => {
    expect(formatDateTime(null)).toBe("");
    expect(formatDateTime(undefined)).toBe("");
    expect(formatDateTime("")).toBe("");
  });

  it("formats date-only without time part", () => {
    // Use a fixed date far from today
    const result = formatDateTime("2025-01-15");
    expect(result).toBe("1/15");
  });

  it("formats ISO with time", () => {
    const result = formatDateTime("2025-01-15T14:30:00+08:00");
    expect(result).toMatch(/1\/15\s+14:30/);
  });

  it("handles invalid date gracefully", () => {
    expect(formatDateTime("not-a-date")).toBe("");
  });
});

describe("formatDateOnly", () => {
  it("returns empty for null", () => {
    expect(formatDateOnly(null)).toBe("");
  });

  it("formats as M/D", () => {
    expect(formatDateOnly("2025-06-01")).toBe("6/1");
  });
});

describe("getDefaultTime", () => {
  it("due_date defaults to 23:59", () => {
    expect(getDefaultTime("due_date")).toEqual({ hour: 23, minute: 59 });
  });

  it("start_date defaults to 09:00", () => {
    expect(getDefaultTime("start_date")).toEqual({ hour: 9, minute: 0 });
  });

  it("end_date defaults to 18:00", () => {
    expect(getDefaultTime("end_date")).toEqual({ hour: 18, minute: 0 });
  });
});

describe("extractTime", () => {
  it("returns null for date-only strings", () => {
    expect(extractTime("2026-03-10")).toBeNull();
  });

  it("extracts hour and minute from ISO", () => {
    const t = extractTime("2026-03-10T14:30:00+08:00");
    expect(t).not.toBeNull();
    // The exact values depend on local timezone, just verify structure
    expect(t).toHaveProperty("hour");
    expect(t).toHaveProperty("minute");
  });

  it("returns null for undefined", () => {
    expect(extractTime(undefined)).toBeNull();
  });
});

describe("extractDate", () => {
  it("extracts year, month, day", () => {
    const d = extractDate("2026-03-10T14:30:00+08:00");
    expect(d).not.toBeNull();
    expect(d).toHaveProperty("year");
    expect(d).toHaveProperty("month");
    expect(d).toHaveProperty("day");
  });

  it("returns null for undefined", () => {
    expect(extractDate(undefined)).toBeNull();
  });
});

describe("combineDateTimeISO", () => {
  it("produces valid ISO string", () => {
    const iso = combineDateTimeISO(2026, 2, 10, 14, 30);
    expect(iso).toMatch(/^2026-03-10T14:30:00[+-]\d{2}:\d{2}$/);
  });
});

describe("getDaysInMonth", () => {
  it("returns 31 for January", () => {
    expect(getDaysInMonth(2026, 0)).toBe(31);
  });

  it("returns 28 for Feb 2026 (non-leap)", () => {
    expect(getDaysInMonth(2026, 1)).toBe(28);
  });

  it("returns 29 for Feb 2024 (leap year)", () => {
    expect(getDaysInMonth(2024, 1)).toBe(29);
  });
});

describe("getFirstDayOfMonth", () => {
  it("returns 0-6 for day of week", () => {
    const dow = getFirstDayOfMonth(2026, 2); // March 2026
    expect(dow).toBeGreaterThanOrEqual(0);
    expect(dow).toBeLessThanOrEqual(6);
  });
});
