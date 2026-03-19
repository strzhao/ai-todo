import { describe, it, expect } from "vitest";
import { createAiTraceId, summarizeParsedActions } from "@/lib/ai-flow-log";
import type { ParsedAction } from "@/lib/types";

describe("createAiTraceId", () => {
  it("returns a string starting with 'ai-'", () => {
    const id = createAiTraceId();
    expect(id).toMatch(/^ai-\d+-[a-z0-9]+$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 10 }, () => createAiTraceId()));
    expect(ids.size).toBe(10);
  });
});

describe("summarizeParsedActions", () => {
  it("summarizes a create action", () => {
    const actions: ParsedAction[] = [
      {
        type: "create",
        tasks: [
          { title: "Task A", children: [{ title: "Sub A1" }] },
          { title: "Task B" },
        ],
      },
    ];
    const result = summarizeParsedActions(actions);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("create");
    expect(result[0].task_count).toBe(2);
    const tasks = result[0].tasks as Array<Record<string, unknown>>;
    expect(tasks[0].title).toBe("Task A");
    expect(tasks[0].children_count).toBe(1);
    expect(tasks[1].children_count).toBe(0);
  });

  it("summarizes an update action", () => {
    const actions: ParsedAction[] = [
      {
        type: "update",
        target_id: "id-1",
        target_title: "My Task",
        changes: { priority: 0, title: "New Title" },
      },
    ];
    const result = summarizeParsedActions(actions);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("update");
    expect(result[0].target_id).toBe("id-1");
    expect(result[0].change_keys).toEqual(["priority", "title"]);
  });

  it("summarizes a move action", () => {
    const actions: ParsedAction[] = [
      {
        type: "move",
        target_id: "id-1",
        target_title: "Task",
        to_parent_id: "id-2",
        to_parent_title: "Parent",
      },
    ];
    const result = summarizeParsedActions(actions);
    expect(result[0].type).toBe("move");
    expect(result[0].to_parent_id).toBe("id-2");
  });

  it("summarizes an add_log action", () => {
    const actions: ParsedAction[] = [
      {
        type: "add_log",
        target_id: "id-1",
        target_title: "Task",
        log_content: "Did some work",
      },
    ];
    const result = summarizeParsedActions(actions);
    expect(result[0].type).toBe("add_log");
    expect(result[0].has_log_content).toBe(true);
  });

  it("summarizes complete/delete/reopen with basic fields", () => {
    const actions: ParsedAction[] = [
      { type: "complete", target_id: "id-1", target_title: "Task A" },
      { type: "delete", target_id: "id-2", target_title: "Task B" },
      { type: "reopen", target_id: "id-3", target_title: "Task C" },
    ];
    const result = summarizeParsedActions(actions);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: "complete", target_id: "id-1", target_title: "Task A" });
    expect(result[1]).toEqual({ type: "delete", target_id: "id-2", target_title: "Task B" });
    expect(result[2]).toEqual({ type: "reopen", target_id: "id-3", target_title: "Task C" });
  });

  it("returns empty array for empty input", () => {
    expect(summarizeParsedActions([])).toEqual([]);
  });
});
