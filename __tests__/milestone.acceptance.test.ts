import { describe, it, expect } from "vitest";
import { parseItem, parseActions } from "@/lib/parse-utils";
import { getDisallowedFields } from "@/lib/task-permissions";
import type { Task, ParsedTask, ParsedActionChanges } from "@/lib/types";

// ── 类型编译时验证 ──────────────────────────────────────────────────────────────
// 如果 milestone 字段不存在于类型定义中，以下代码将无法编译

describe("milestone 类型验证", () => {
  it("Task 接口包含 milestone 可选字段", () => {
    const task: Partial<Task> = { milestone: "v1.0 发布" };
    expect(task.milestone).toBe("v1.0 发布");
  });

  it("Task 接口 milestone 可以为 undefined", () => {
    const task: Partial<Task> = {};
    expect(task.milestone).toBeUndefined();
  });

  it("ParsedTask 接口包含 milestone 可选字段", () => {
    const parsed: Partial<ParsedTask> = { milestone: "Beta 里程碑" };
    expect(parsed.milestone).toBe("Beta 里程碑");
  });

  it("ParsedActionChanges 接口包含 milestone 可选字段", () => {
    const changes: ParsedActionChanges = { milestone: "Sprint 1 完成" };
    expect(changes.milestone).toBe("Sprint 1 完成");
  });

  it("ParsedActionChanges milestone 可以为 null（清除）", () => {
    const changes: ParsedActionChanges = { milestone: null };
    expect(changes.milestone).toBeNull();
  });
});

// ── parseItem 提取 milestone ────────────────────────────────────────────────────

describe("parseItem — milestone 字段提取", () => {
  it("正常提取 milestone 字段", () => {
    const result = parseItem(
      { title: "发布 v1.0", milestone: "v1.0 发布" },
      "fallback"
    );
    expect(result.milestone).toBe("v1.0 发布");
  });

  it("milestone 缺失时结果中无该字段或为 undefined", () => {
    const result = parseItem({ title: "普通任务" }, "fallback");
    expect(result.milestone).toBeUndefined();
  });

  it("milestone 为空字符串时忽略（不设置）", () => {
    const result = parseItem({ title: "任务", milestone: "" }, "fallback");
    expect(result.milestone).toBeUndefined();
  });

  it("milestone 超过 100 字符时截断到 100 字符", () => {
    const longMilestone = "A".repeat(150);
    const result = parseItem(
      { title: "任务", milestone: longMilestone },
      "fallback"
    );
    expect(result.milestone).toBe("A".repeat(100));
  });

  it("milestone 恰好 100 字符时保留", () => {
    const exactMilestone = "B".repeat(100);
    const result = parseItem(
      { title: "任务", milestone: exactMilestone },
      "fallback"
    );
    expect(result.milestone).toBe(exactMilestone);
  });

  it("milestone 为非字符串类型时忽略", () => {
    const result = parseItem(
      { title: "任务", milestone: 123 },
      "fallback"
    );
    expect(result.milestone).toBeUndefined();
  });
});

// ── parseActions — update action 中的 milestone ─────────────────────────────────

describe("parseActions — milestone 变更", () => {
  it("update changes 包含 milestone 字段", () => {
    const result = {
      actions: [
        {
          type: "update",
          target_id: "uuid-1",
          target_title: "发布任务",
          changes: { milestone: "v2.0 里程碑" },
        },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions[0].type).toBe("update");
    expect(actions[0].changes?.milestone).toBe("v2.0 里程碑");
  });

  it("update changes milestone 设为 null（清除里程碑）", () => {
    const result = {
      actions: [
        {
          type: "update",
          target_id: "uuid-1",
          changes: { milestone: null },
        },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions[0].changes?.milestone).toBeNull();
  });

  it("create action 中的任务包含 milestone", () => {
    const result = {
      actions: [
        {
          type: "create",
          tasks: [
            { title: "里程碑任务", milestone: "Q1 交付" },
            { title: "普通任务" },
          ],
        },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions[0].tasks![0].milestone).toBe("Q1 交付");
    expect(actions[0].tasks![1].milestone).toBeUndefined();
  });
});

// ── 权限验证：milestone 映射到 update_title ─────────────────────────────────────

describe("milestone 权限", () => {
  it("milestone 字段映射到 update_title 权限（creator 可修改）", () => {
    const disallowed = getDisallowedFields(["creator"], ["milestone"]);
    expect(disallowed).toEqual([]);
  });

  it("milestone 字段映射到 update_title 权限（space_owner 可修改）", () => {
    const disallowed = getDisallowedFields(["space_owner"], ["milestone"]);
    expect(disallowed).toEqual([]);
  });

  it("assignee 不能修改 milestone（与 title 相同权限）", () => {
    const disallowed = getDisallowedFields(["assignee"], ["milestone"]);
    expect(disallowed).toContain("milestone");
  });

  it("space_member 不能修改 milestone", () => {
    const disallowed = getDisallowedFields(["space_member"], ["milestone"]);
    expect(disallowed).toContain("milestone");
  });

  it("space_admin 不能修改 milestone（与 title 相同权限）", () => {
    const disallowed = getDisallowedFields(["space_admin"], ["milestone"]);
    expect(disallowed).toContain("milestone");
  });

  it("milestone 和 title 权限一致", () => {
    const roles = ["creator", "assignee", "space_owner", "space_admin", "space_member"] as const;
    for (const role of roles) {
      const titleDisallowed = getDisallowedFields([role], ["title"]);
      const milestoneDisallowed = getDisallowedFields([role], ["milestone"]);
      const titleAllowed = titleDisallowed.length === 0;
      const milestoneAllowed = milestoneDisallowed.length === 0;
      expect(milestoneAllowed).toBe(titleAllowed);
    }
  });
});
