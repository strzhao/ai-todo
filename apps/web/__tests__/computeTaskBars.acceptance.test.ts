import { describe, it, expect } from "vitest";
import { computeTaskBars } from "@/lib/gantt-utils";
import type { Task } from "@/lib/types";

// Helper: create a minimal Task with overrides
function makeTask(id: string, overrides?: Partial<Task>): Task {
  return {
    id,
    user_id: "u1",
    title: `Task ${id}`,
    priority: 2,
    status: 0,
    tags: [],
    sort_order: 0,
    created_at: "2026-03-01T00:00:00Z",
    progress: 0,
    ...overrides,
  } as Task;
}

// Helper: build a week of Date objects starting from a Monday
// Returns 7 dates [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
function makeWeekDays(mondayStr: string): Date[] {
  const monday = new Date(mondayStr);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

// Week: 2026-03-09 (Mon) to 2026-03-15 (Sun)
const WEEK = makeWeekDays("2026-03-09");
// For reference:
// Col 0 = Mon 03-09
// Col 1 = Tue 03-10
// Col 2 = Wed 03-11
// Col 3 = Thu 03-12
// Col 4 = Fri 03-13
// Col 5 = Sat 03-14
// Col 6 = Sun 03-15

describe("computeTaskBars", () => {
  // --- Requirement 1: single-day task (only due_date) => spanCols=1 ---
  describe("1. single-day task (due_date only)", () => {
    it("due_date on Wednesday => startCol=2, spanCols=1", () => {
      const tasks = [makeTask("a", { due_date: "2026-03-11" })];
      const bars = computeTaskBars(tasks, WEEK);
      expect(bars).toHaveLength(1);
      expect(bars[0].startCol).toBe(2);
      expect(bars[0].spanCols).toBe(1);
      expect(bars[0].task.id).toBe("a");
    });

    it("due_date on Monday (first day) => startCol=0, spanCols=1", () => {
      const tasks = [makeTask("a", { due_date: "2026-03-09" })];
      const bars = computeTaskBars(tasks, WEEK);
      expect(bars).toHaveLength(1);
      expect(bars[0].startCol).toBe(0);
      expect(bars[0].spanCols).toBe(1);
    });

    it("due_date on Sunday (last day) => startCol=6, spanCols=1", () => {
      const tasks = [makeTask("a", { due_date: "2026-03-15" })];
      const bars = computeTaskBars(tasks, WEEK);
      expect(bars).toHaveLength(1);
      expect(bars[0].startCol).toBe(6);
      expect(bars[0].spanCols).toBe(1);
    });
  });

  // --- Requirement 2: multi-day task (start_date + end_date) => continuous bar ---
  describe("2. multi-day task spans multiple columns", () => {
    it("Mon-Wed => startCol=0, spanCols=3", () => {
      const tasks = [makeTask("a", { start_date: "2026-03-09", end_date: "2026-03-11" })];
      const bars = computeTaskBars(tasks, WEEK);
      expect(bars).toHaveLength(1);
      expect(bars[0].startCol).toBe(0);
      expect(bars[0].spanCols).toBe(3);
    });

    it("Tue-Fri => startCol=1, spanCols=4", () => {
      const tasks = [makeTask("a", { start_date: "2026-03-10", end_date: "2026-03-13" })];
      const bars = computeTaskBars(tasks, WEEK);
      expect(bars).toHaveLength(1);
      expect(bars[0].startCol).toBe(1);
      expect(bars[0].spanCols).toBe(4);
    });

    it("Mon-Sun (full week) => startCol=0, spanCols=7", () => {
      const tasks = [makeTask("a", { start_date: "2026-03-09", end_date: "2026-03-15" })];
      const bars = computeTaskBars(tasks, WEEK);
      expect(bars).toHaveLength(1);
      expect(bars[0].startCol).toBe(0);
      expect(bars[0].spanCols).toBe(7);
    });
  });

  // --- Requirement 3: cross-week clamping ---
  describe("3. cross-week clamping to 0-6", () => {
    it("task started last week, ends Wednesday => startCol=0, spanCols=3", () => {
      const tasks = [makeTask("a", { start_date: "2026-03-05", end_date: "2026-03-11" })];
      const bars = computeTaskBars(tasks, WEEK);
      expect(bars).toHaveLength(1);
      expect(bars[0].startCol).toBe(0);
      expect(bars[0].spanCols).toBe(3);
    });

    it("task starts Thursday, extends into next week => startCol=3, spanCols extends to end of week (4)", () => {
      const tasks = [makeTask("a", { start_date: "2026-03-12", end_date: "2026-03-20" })];
      const bars = computeTaskBars(tasks, WEEK);
      expect(bars).toHaveLength(1);
      expect(bars[0].startCol).toBe(3);
      expect(bars[0].spanCols).toBe(4); // Thu-Sun = 4 cols
    });

    it("task spans entire surrounding weeks => clamped to startCol=0, spanCols=7", () => {
      const tasks = [makeTask("a", { start_date: "2026-03-01", end_date: "2026-03-22" })];
      const bars = computeTaskBars(tasks, WEEK);
      expect(bars).toHaveLength(1);
      expect(bars[0].startCol).toBe(0);
      expect(bars[0].spanCols).toBe(7);
    });
  });

  // --- Requirement 4: overlapping tasks go to different rows ---
  describe("4. overlapping tasks assigned to different rows", () => {
    it("two tasks on the same day => different rows", () => {
      const tasks = [
        makeTask("a", { due_date: "2026-03-11" }),
        makeTask("b", { due_date: "2026-03-11" }),
      ];
      const bars = computeTaskBars(tasks, WEEK);
      expect(bars).toHaveLength(2);
      const rows = bars.map((b) => b.row);
      expect(rows[0]).not.toBe(rows[1]);
    });

    it("two multi-day tasks with overlapping ranges => different rows", () => {
      const tasks = [
        makeTask("a", { start_date: "2026-03-09", end_date: "2026-03-12" }),
        makeTask("b", { start_date: "2026-03-11", end_date: "2026-03-14" }),
      ];
      const bars = computeTaskBars(tasks, WEEK);
      expect(bars).toHaveLength(2);
      const rows = bars.map((b) => b.row);
      expect(rows[0]).not.toBe(rows[1]);
    });

    it("three overlapping tasks => three different rows", () => {
      const tasks = [
        makeTask("a", { start_date: "2026-03-09", end_date: "2026-03-15" }),
        makeTask("b", { start_date: "2026-03-09", end_date: "2026-03-15" }),
        makeTask("c", { start_date: "2026-03-09", end_date: "2026-03-15" }),
      ];
      const bars = computeTaskBars(tasks, WEEK);
      expect(bars).toHaveLength(3);
      const rows = new Set(bars.map((b) => b.row));
      expect(rows.size).toBe(3);
    });
  });

  // --- Requirement 5: non-overlapping tasks can share the same row ---
  describe("5. non-overlapping tasks share the same row", () => {
    it("Mon task and Fri task => same row", () => {
      const tasks = [
        makeTask("a", { due_date: "2026-03-09" }),
        makeTask("b", { due_date: "2026-03-13" }),
      ];
      const bars = computeTaskBars(tasks, WEEK);
      expect(bars).toHaveLength(2);
      expect(bars[0].row).toBe(bars[1].row);
    });

    it("Mon-Tue and Thu-Fri => same row (no overlap)", () => {
      const tasks = [
        makeTask("a", { start_date: "2026-03-09", end_date: "2026-03-10" }),
        makeTask("b", { start_date: "2026-03-12", end_date: "2026-03-13" }),
      ];
      const bars = computeTaskBars(tasks, WEEK);
      expect(bars).toHaveLength(2);
      expect(bars[0].row).toBe(bars[1].row);
    });

    it("adjacent tasks (Mon-Tue, Wed-Thu) => same row", () => {
      const tasks = [
        makeTask("a", { start_date: "2026-03-09", end_date: "2026-03-10" }),
        makeTask("b", { start_date: "2026-03-11", end_date: "2026-03-12" }),
      ];
      const bars = computeTaskBars(tasks, WEEK);
      expect(bars).toHaveLength(2);
      expect(bars[0].row).toBe(bars[1].row);
    });
  });

  // --- Requirement 6: start_date only (no end_date) => single day ---
  describe("6. start_date only (no end_date) => single day", () => {
    it("start_date on Thursday, no end_date => startCol=3, spanCols=1", () => {
      const tasks = [makeTask("a", { start_date: "2026-03-12" })];
      const bars = computeTaskBars(tasks, WEEK);
      expect(bars).toHaveLength(1);
      expect(bars[0].startCol).toBe(3);
      expect(bars[0].spanCols).toBe(1);
    });
  });

  // --- Requirement 7: percentage-based positioning ---
  describe("7. percentage-based left/width positioning", () => {
    it("startCol=0 => left ~0%", () => {
      const tasks = [makeTask("a", { due_date: "2026-03-09" })];
      const bars = computeTaskBars(tasks, WEEK);
      const expectedLeft = (0 / 7) * 100;
      // Verify startCol allows correct percentage calculation
      expect(bars[0].startCol).toBe(0);
      expect((bars[0].startCol / 7) * 100).toBeCloseTo(expectedLeft);
    });

    it("startCol=3, spanCols=2 => left ~42.86%, width ~28.57%", () => {
      const tasks = [makeTask("a", { start_date: "2026-03-12", end_date: "2026-03-13" })];
      const bars = computeTaskBars(tasks, WEEK);
      expect(bars[0].startCol).toBe(3);
      expect(bars[0].spanCols).toBe(2);
      const left = (bars[0].startCol / 7) * 100;
      const width = (bars[0].spanCols / 7) * 100;
      expect(left).toBeCloseTo(42.857, 1);
      expect(width).toBeCloseTo(28.571, 1);
    });

    it("full week bar => left=0%, width=100%", () => {
      const tasks = [makeTask("a", { start_date: "2026-03-09", end_date: "2026-03-15" })];
      const bars = computeTaskBars(tasks, WEEK);
      expect(bars[0].startCol).toBe(0);
      expect(bars[0].spanCols).toBe(7);
      expect((bars[0].startCol / 7) * 100).toBe(0);
      expect((bars[0].spanCols / 7) * 100).toBe(100);
    });
  });

  // --- Edge cases ---
  describe("edge cases", () => {
    it("empty task list => empty bars", () => {
      const bars = computeTaskBars([], WEEK);
      expect(bars).toHaveLength(0);
    });

    it("task outside the week entirely => not included", () => {
      const tasks = [makeTask("a", { due_date: "2026-03-20" })];
      const bars = computeTaskBars(tasks, WEEK);
      expect(bars).toHaveLength(0);
    });

    it("task with no dates => not included", () => {
      const tasks = [makeTask("a")];
      const bars = computeTaskBars(tasks, WEEK);
      expect(bars).toHaveLength(0);
    });

    it("each bar references the original task object", () => {
      const task = makeTask("a", { due_date: "2026-03-11" });
      const bars = computeTaskBars([task], WEEK);
      expect(bars[0].task).toBe(task);
    });

    it("row values are non-negative integers", () => {
      const tasks = [
        makeTask("a", { start_date: "2026-03-09", end_date: "2026-03-15" }),
        makeTask("b", { start_date: "2026-03-09", end_date: "2026-03-15" }),
        makeTask("c", { due_date: "2026-03-11" }),
      ];
      const bars = computeTaskBars(tasks, WEEK);
      for (const bar of bars) {
        expect(bar.row).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(bar.row)).toBe(true);
      }
    });

    it("startCol is always 0-6 and spanCols is always 1-7", () => {
      const tasks = [
        makeTask("a", { start_date: "2026-03-01", end_date: "2026-03-22" }), // spans way beyond
        makeTask("b", { due_date: "2026-03-15" }), // Sunday
        makeTask("c", { due_date: "2026-03-09" }), // Monday
      ];
      const bars = computeTaskBars(tasks, WEEK);
      for (const bar of bars) {
        expect(bar.startCol).toBeGreaterThanOrEqual(0);
        expect(bar.startCol).toBeLessThanOrEqual(6);
        expect(bar.spanCols).toBeGreaterThanOrEqual(1);
        expect(bar.spanCols).toBeLessThanOrEqual(7);
        // startCol + spanCols should not exceed 7
        expect(bar.startCol + bar.spanCols).toBeLessThanOrEqual(7);
      }
    });
  });
});
