import { describe, it, expect } from "vitest";
import { buildTree } from "@/lib/task-utils";
import type { Task } from "@/lib/types";

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    user_id: "user1",
    title: `Task ${id}`,
    status: 0,
    priority: 2,
    tags: [],
    created_at: "2026-01-01T00:00:00Z",
    parent_id: null,
    ...overrides,
  } as Task;
}

describe("buildTree", () => {
  it("空数组返回 []", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("单个根任务（无 parent_id）", () => {
    const tasks = [makeTask("1")];
    const tree = buildTree(tasks);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("1");
    expect(tree[0].subtasks).toEqual([]);
  });

  it("一父一子", () => {
    const tasks = [makeTask("1"), makeTask("2", { parent_id: "1" })];
    const tree = buildTree(tasks);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("1");
    expect(tree[0].subtasks).toHaveLength(1);
    expect(tree[0].subtasks[0].id).toBe("2");
  });

  it("一父多子", () => {
    const tasks = [
      makeTask("1"),
      makeTask("2", { parent_id: "1" }),
      makeTask("3", { parent_id: "1" }),
      makeTask("4", { parent_id: "1" }),
    ];
    const tree = buildTree(tasks);
    expect(tree).toHaveLength(1);
    expect(tree[0].subtasks).toHaveLength(3);
  });

  it("孤立子任务（parent_id 指向不存在的任务）→ 作为 root", () => {
    const tasks = [makeTask("2", { parent_id: "nonexistent" })];
    const tree = buildTree(tasks);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("2");
  });

  it("乱序输入（子任务在父任务之前）→ 仍正确组装", () => {
    const tasks = [
      makeTask("2", { parent_id: "1" }),
      makeTask("1"),
    ];
    const tree = buildTree(tasks);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("1");
    expect(tree[0].subtasks).toHaveLength(1);
    expect(tree[0].subtasks[0].id).toBe("2");
  });

  it("多棵独立树", () => {
    const tasks = [
      makeTask("1"),
      makeTask("2"),
      makeTask("3", { parent_id: "1" }),
      makeTask("4", { parent_id: "2" }),
    ];
    const tree = buildTree(tasks);
    expect(tree).toHaveLength(2);
    expect(tree.find((n) => n.id === "1")?.subtasks).toHaveLength(1);
    expect(tree.find((n) => n.id === "2")?.subtasks).toHaveLength(1);
  });

  it("parent_id 为 null 的任务作为 root", () => {
    const tasks = [makeTask("1", { parent_id: null })];
    const tree = buildTree(tasks);
    expect(tree).toHaveLength(1);
  });

  it("空字符串 parent_id 视为无父（作为 root）", () => {
    const tasks = [makeTask("1", { parent_id: "" as unknown as null })];
    const tree = buildTree(tasks);
    expect(tree).toHaveLength(1);
  });

  it("同一个父任务的子任务顺序与输入顺序一致", () => {
    const tasks = [
      makeTask("1"),
      makeTask("2", { parent_id: "1" }),
      makeTask("3", { parent_id: "1" }),
    ];
    const tree = buildTree(tasks);
    expect(tree[0].subtasks[0].id).toBe("2");
    expect(tree[0].subtasks[1].id).toBe("3");
  });

  it("3 层深度（曾孙节点）", () => {
    const tasks = [
      makeTask("1"),
      makeTask("2", { parent_id: "1" }),
      makeTask("3", { parent_id: "2" }),
    ];
    const tree = buildTree(tasks);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("1");
    expect(tree[0].subtasks).toHaveLength(1);
    expect(tree[0].subtasks[0].id).toBe("2");
    expect(tree[0].subtasks[0].subtasks).toHaveLength(1);
    expect(tree[0].subtasks[0].subtasks[0].id).toBe("3");
    expect(tree[0].subtasks[0].subtasks[0].subtasks).toEqual([]);
  });

  it("4 层深度（任意嵌套）", () => {
    const tasks = [
      makeTask("1"),
      makeTask("2", { parent_id: "1" }),
      makeTask("3", { parent_id: "2" }),
      makeTask("4", { parent_id: "3" }),
    ];
    const tree = buildTree(tasks);
    const level3 = tree[0].subtasks[0].subtasks[0];
    expect(level3.id).toBe("3");
    expect(level3.subtasks).toHaveLength(1);
    expect(level3.subtasks[0].id).toBe("4");
  });

  it("混合深度：部分 2 层、部分 3 层", () => {
    const tasks = [
      makeTask("root"),
      makeTask("child1", { parent_id: "root" }),
      makeTask("child2", { parent_id: "root" }),
      makeTask("grand", { parent_id: "child1" }),
    ];
    const tree = buildTree(tasks);
    expect(tree).toHaveLength(1);
    const root = tree[0];
    expect(root.subtasks).toHaveLength(2);
    const c1 = root.subtasks.find((s) => s.id === "child1")!;
    const c2 = root.subtasks.find((s) => s.id === "child2")!;
    expect(c1.subtasks).toHaveLength(1);
    expect(c1.subtasks[0].id).toBe("grand");
    expect(c2.subtasks).toHaveLength(0);
  });
});
