import { describe, it, expect } from "vitest";
import {
  getTaskRoles,
  checkTaskPermission,
  getDisallowedFields,
  TaskPermissionError,
  type TaskRole,
  type TaskOperation,
} from "@/lib/task-permissions";

// ── 测试数据 ──────────────────────────────────────────────────────────────────

const USER_A = "user-a";
const USER_B = "user-b";
const USER_C = "user-c";
const SPACE_ID = "space-001";

// 空间内 A 创建、B 是经办人的任务
const spaceTask = { user_id: USER_A, assignee_id: USER_B, space_id: SPACE_ID };
// 个人任务（无 space_id）
const personalTask = { user_id: USER_A, space_id: undefined };
// 空间内无经办人的任务
const unassignedSpaceTask = { user_id: USER_A, space_id: SPACE_ID };

// ── getTaskRoles：角色计算 ────────────────────────────────────────────────────

describe("getTaskRoles", () => {
  it("创建者身份", () => {
    const roles = getTaskRoles(spaceTask, USER_A, "member");
    expect(roles).toContain("creator");
  });

  it("经办人身份", () => {
    const roles = getTaskRoles(spaceTask, USER_B, "member");
    expect(roles).toContain("assignee");
    expect(roles).not.toContain("creator");
  });

  it("空间 owner 身份", () => {
    const roles = getTaskRoles(spaceTask, USER_C, "owner");
    expect(roles).toContain("space_owner");
    expect(roles).not.toContain("creator");
    expect(roles).not.toContain("assignee");
  });

  it("空间 admin 身份", () => {
    const roles = getTaskRoles(spaceTask, USER_C, "admin");
    expect(roles).toContain("space_admin");
  });

  it("普通空间成员", () => {
    const roles = getTaskRoles(spaceTask, USER_C, "member");
    expect(roles).toContain("space_member");
  });

  it("多角色叠加：创建者 + 空间 owner", () => {
    const roles = getTaskRoles(spaceTask, USER_A, "owner");
    expect(roles).toContain("creator");
    expect(roles).toContain("space_owner");
    expect(roles.length).toBe(2);
  });

  it("多角色叠加：经办人 + 空间 member", () => {
    const roles = getTaskRoles(spaceTask, USER_B, "member");
    expect(roles).toContain("assignee");
    expect(roles).toContain("space_member");
  });

  it("个人任务不产生空间角色", () => {
    const roles = getTaskRoles(personalTask, USER_A, undefined);
    expect(roles).toEqual(["creator"]);
  });

  it("个人任务非创建者无角色", () => {
    const roles = getTaskRoles(personalTask, USER_B, undefined);
    expect(roles).toEqual([]);
  });

  it("无 memberRole 参数时不产生空间角色", () => {
    const roles = getTaskRoles(spaceTask, USER_C, undefined);
    expect(roles).toEqual([]);
  });
});

// ── checkTaskPermission：完整权限矩阵 ──────────────────────────────────────────

describe("checkTaskPermission — 完整矩阵", () => {
  // 设计文档定义的权限矩阵
  const matrix: Record<TaskOperation, Record<TaskRole, boolean>> = {
    update_title:       { creator: true,  assignee: false, space_owner: true,  space_admin: false, space_member: false },
    update_description: { creator: true,  assignee: true,  space_owner: true,  space_admin: false, space_member: false },
    update_priority:    { creator: true,  assignee: false, space_owner: true,  space_admin: false, space_member: false },
    update_dates:       { creator: true,  assignee: true,  space_owner: true,  space_admin: false, space_member: false },
    update_tags:        { creator: true,  assignee: true,  space_owner: true,  space_admin: false, space_member: false },
    update_assignee:    { creator: true,  assignee: false, space_owner: true,  space_admin: true,  space_member: false },
    update_progress:    { creator: true,  assignee: true,  space_owner: true,  space_admin: false, space_member: false },
    update_type:        { creator: true,  assignee: false, space_owner: true,  space_admin: false, space_member: false },
    move:               { creator: true,  assignee: false, space_owner: true,  space_admin: false, space_member: false },
    complete:           { creator: true,  assignee: true,  space_owner: true,  space_admin: false, space_member: false },
    reopen:             { creator: true,  assignee: true,  space_owner: true,  space_admin: false, space_member: false },
    delete:             { creator: true,  assignee: false, space_owner: true,  space_admin: false, space_member: false },
    add_log:            { creator: true,  assignee: true,  space_owner: true,  space_admin: true,  space_member: true  },
  };

  const operations = Object.keys(matrix) as TaskOperation[];
  const roles: TaskRole[] = ["creator", "assignee", "space_owner", "space_admin", "space_member"];

  for (const op of operations) {
    for (const role of roles) {
      const expected = matrix[op][role];
      it(`${role} ${expected ? "可以" : "不能"} ${op}`, () => {
        expect(checkTaskPermission([role], op)).toBe(expected);
      });
    }
  }
});

describe("checkTaskPermission — 边界场景", () => {
  it("admin 只能改经办人和添加日志", () => {
    const adminOnlyOps: TaskOperation[] = ["update_assignee", "add_log"];
    const allOps: TaskOperation[] = [
      "update_title", "update_description", "update_priority",
      "update_dates", "update_tags", "update_assignee",
      "update_progress", "update_type", "move",
      "complete", "reopen", "delete", "add_log",
    ];
    for (const op of allOps) {
      const result = checkTaskPermission(["space_admin"], op);
      if (adminOnlyOps.includes(op)) {
        expect(result).toBe(true);
      } else {
        expect(result).toBe(false);
      }
    }
  });

  it("assignee 能完成但不能删除", () => {
    expect(checkTaskPermission(["assignee"], "complete")).toBe(true);
    expect(checkTaskPermission(["assignee"], "reopen")).toBe(true);
    expect(checkTaskPermission(["assignee"], "delete")).toBe(false);
  });

  it("普通 member 只能添加日志", () => {
    const allOps: TaskOperation[] = [
      "update_title", "update_description", "update_priority",
      "update_dates", "update_tags", "update_assignee",
      "update_progress", "update_type", "move",
      "complete", "reopen", "delete", "add_log",
    ];
    for (const op of allOps) {
      const result = checkTaskPermission(["space_member"], op);
      if (op === "add_log") {
        expect(result).toBe(true);
      } else {
        expect(result).toBe(false);
      }
    }
  });

  it("空角色列表拒绝所有操作", () => {
    expect(checkTaskPermission([], "delete")).toBe(false);
    expect(checkTaskPermission([], "add_log")).toBe(false);
  });

  it("多角色叠加扩展权限", () => {
    // assignee 不能删除，但 creator 可以 → assignee+creator 应该可以
    expect(checkTaskPermission(["assignee", "creator"], "delete")).toBe(true);
    // space_admin 不能完成，但 assignee 可以
    expect(checkTaskPermission(["space_admin", "assignee"], "complete")).toBe(true);
  });
});

// ── getDisallowedFields：字段级权限检查 ────────────────────────────────────────

describe("getDisallowedFields", () => {
  it("创建者修改任意字段 → 空数组", () => {
    const allFields = ["title", "description", "priority", "due_date", "tags", "assignee_email", "progress", "type", "parent_id"];
    expect(getDisallowedFields(["creator"], allFields)).toEqual([]);
  });

  it("普通成员尝试修改多个字段 → 返回所有不允许的字段", () => {
    const fields = ["title", "description", "priority", "tags"];
    const disallowed = getDisallowedFields(["space_member"], fields);
    expect(disallowed).toContain("title");
    expect(disallowed).toContain("description");
    expect(disallowed).toContain("priority");
    expect(disallowed).toContain("tags");
    expect(disallowed.length).toBe(4);
  });

  it("经办人修改 title 被拒绝，修改 description 被允许", () => {
    const disallowed = getDisallowedFields(["assignee"], ["title", "description"]);
    expect(disallowed).toContain("title");
    expect(disallowed).not.toContain("description");
  });

  it("经办人可以修改日期相关字段", () => {
    const disallowed = getDisallowedFields(["assignee"], ["due_date", "start_date", "end_date"]);
    expect(disallowed).toEqual([]);
  });

  it("经办人不能修改 type 和 parent_id", () => {
    const disallowed = getDisallowedFields(["assignee"], ["type", "parent_id"]);
    expect(disallowed).toContain("type");
    expect(disallowed).toContain("parent_id");
  });

  it("assignee_email 和 assigneeEmail 都映射到 update_assignee", () => {
    // 普通成员不能修改经办人
    const d1 = getDisallowedFields(["space_member"], ["assignee_email"]);
    const d2 = getDisallowedFields(["space_member"], ["assigneeEmail"]);
    expect(d1).toContain("assignee_email");
    expect(d2).toContain("assigneeEmail");

    // admin 可以修改经办人
    expect(getDisallowedFields(["space_admin"], ["assignee_email"])).toEqual([]);
    expect(getDisallowedFields(["space_admin"], ["assigneeEmail"])).toEqual([]);
  });

  it("空间 owner 修改所有字段 → 空数组", () => {
    const allFields = ["title", "description", "priority", "due_date", "start_date", "end_date", "tags", "assignee_email", "progress", "type", "parent_id"];
    expect(getDisallowedFields(["space_owner"], allFields)).toEqual([]);
  });

  it("不在映射表中的字段被忽略（不报错）", () => {
    const disallowed = getDisallowedFields(["space_member"], ["unknown_field", "title"]);
    expect(disallowed).toContain("title");
    expect(disallowed).not.toContain("unknown_field");
  });
});

// ── TaskPermissionError ──────────────────────────────────────────────────────

describe("TaskPermissionError", () => {
  it("是 Error 的子类", () => {
    const err = new TaskPermissionError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("TaskPermissionError");
    expect(err.message).toBe("test");
  });
});
