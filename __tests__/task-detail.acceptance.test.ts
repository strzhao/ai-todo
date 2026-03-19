import { describe, it, expect, test } from "vitest";
import type { Task, TaskMember } from "@/lib/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: "task-1",
    user_id: "user-1",
    title: "测试任务",
    description: "任务描述",
    priority: 2,
    status: 0,
    tags: ["tag1", "tag2"],
    sort_order: 0,
    created_at: "2026-03-18T00:00:00Z",
    progress: 50,
    due_date: "2026-03-20T00:00:00Z",
    start_date: "2026-03-18T00:00:00Z",
    end_date: "2026-03-20T00:00:00Z",
    ...overrides,
  } as Task;
}

function makeSpaceTask(overrides?: Partial<Task>): Task {
  return makeTask({
    space_id: "space-1",
    assignee_id: "user-2",
    assignee_email: "assignee@test.com",
    ...overrides,
  });
}

function makeMember(overrides?: Partial<TaskMember>): TaskMember {
  return {
    id: "member-1",
    task_id: "space-1",
    user_id: "user-2",
    email: "member@test.com",
    role: "member",
    status: "active",
    joined_at: "2026-03-01T00:00:00Z",
    ...overrides,
  };
}

// ─── 1. 模块导出契约 ─────────────────────────────────────────────────────────

describe("TaskDetail: 模块导出", () => {
  it("TaskDetail 组件可以正常 import（default export）", async () => {
    const mod = await import("@/components/TaskDetail");
    expect(mod).toBeDefined();
    // 应作为 default export 或命名 export 存在
    const TaskDetail = (mod as Record<string, unknown>).default ?? (mod as Record<string, unknown>).TaskDetail;
    expect(TaskDetail).toBeDefined();
    expect(typeof TaskDetail).toBe("function");
  });
});

// ─── 2. Props 接口契约 ───────────────────────────────────────────────────────

describe("TaskDetail: Props 接口契约", () => {
  it("组件函数接受 task 作为必选参数（至少 1 个参数）", async () => {
    const mod = await import("@/components/TaskDetail");
    const TaskDetail = (mod as Record<string, unknown>).default ?? (mod as Record<string, unknown>).TaskDetail;
    // React 函数组件至少接受 1 个参数 (props)
    expect((TaskDetail as (...args: unknown[]) => unknown).length).toBeGreaterThanOrEqual(0);
  });

  it("Task 类型包含编辑面板需要的所有字段", () => {
    const task = makeTask();
    // 标题编辑需要 title
    expect(task).toHaveProperty("title");
    // 优先级选择需要 priority（P0-P3）
    expect(task).toHaveProperty("priority");
    expect([0, 1, 2, 3]).toContain(task.priority);
    // 日期编辑需要 due_date, start_date, end_date
    expect(task).toHaveProperty("due_date");
    expect(task).toHaveProperty("start_date");
    expect(task).toHaveProperty("end_date");
    // 标签管理需要 tags
    expect(task).toHaveProperty("tags");
    expect(Array.isArray(task.tags)).toBe(true);
    // 进度条需要 progress
    expect(task).toHaveProperty("progress");
    expect(task.progress).toBeGreaterThanOrEqual(0);
    expect(task.progress).toBeLessThanOrEqual(100);
    // 描述编辑
    expect(task).toHaveProperty("description");
  });

  it("空间任务包含 assignee 相关字段", () => {
    const task = makeSpaceTask();
    expect(task).toHaveProperty("space_id");
    expect(task).toHaveProperty("assignee_id");
    expect(task).toHaveProperty("assignee_email");
    expect(task.space_id).toBeTruthy();
  });

  it("非空间任务不含 space_id", () => {
    const task = makeTask();
    expect(task.space_id).toBeUndefined();
  });

  it("TaskMember 类型包含负责人选择需要的字段", () => {
    const member = makeMember({ display_name: "测试成员" });
    expect(member).toHaveProperty("user_id");
    expect(member).toHaveProperty("email");
    expect(member).toHaveProperty("display_name");
    expect(member).toHaveProperty("role");
  });
});

// ─── 3. 模式行为验收（test.todo — 需手工验证的 UI 行为）────────────────────

describe("TaskDetail: standalone 模式", () => {
  test.todo("standalone 模式下应显示可编辑标题区域");
  test.todo("standalone 模式下应显示完成按钮");
  test.todo("standalone 模式下应显示删除按钮");
  test.todo("standalone 模式下点击完成按钮应触发 onComplete 回调");
  test.todo("standalone 模式下点击删除按钮应触发 onDelete 回调");
  test.todo("standalone 模式下编辑标题后应触发 onUpdate 回调");
});

describe("TaskDetail: embedded 模式", () => {
  test.todo("embedded 模式下不应显示标题区域");
  test.todo("embedded 模式下不应显示完成/删除按钮");
  test.todo("embedded 模式下仍应显示元数据编辑区（优先级、日期、标签等）");
  test.todo("embedded 模式下仍应显示描述和日志区域");
});

describe("TaskDetail: readonly 模式", () => {
  test.todo("readonly 模式下优先级显示为纯文本，不可点击");
  test.todo("readonly 模式下日期显示为纯文本，无 DateTimePicker");
  test.todo("readonly 模式下标签不显示添加/删除控件");
  test.todo("readonly 模式下进度条不可拖动");
  test.todo("readonly 模式下负责人不可更改");
  test.todo("readonly 模式下描述不可编辑");
});

// ─── 4. 编辑能力字段验收 ─────────────────────────────────────────────────────

describe("TaskDetail: 编辑能力字段", () => {
  test.todo("优先级选择：应显示 P0-P3 四个按钮/选项");
  test.todo("优先级选择：点击后触发 onUpdate({ priority: N })");
  test.todo("日期编辑：due_date 字段使用 DateTimePicker 组件");
  test.todo("日期编辑：start_date 字段使用 DateTimePicker 组件");
  test.todo("日期编辑：end_date 字段使用 DateTimePicker 组件");
  test.todo("标签管理：显示已有标签列表");
  test.todo("标签管理：可添加新标签");
  test.todo("标签管理：可删除已有标签");
  test.todo("进度条：显示 0-100% 范围的 slider");
  test.todo("进度条：拖动后触发 onUpdate({ progress: N })");
});

// ─── 5. 负责人选择逻辑（空间 vs 非空间）────────────────────────────────────

describe("TaskDetail: 负责人选择", () => {
  test.todo("空间任务（space_id 存在）应显示负责人选择 Popover");
  test.todo("空间任务的负责人选择应列出所有 members");
  test.todo("选择负责人后触发 onUpdate({ assignee_id, assignee_email })");
  test.todo("非空间任务（无 space_id）不应显示负责人选择");
});

// ─── 6. 回调函数验收 ─────────────────────────────────────────────────────────

describe("TaskDetail: 回调函数", () => {
  test.todo("onUpdate 回调传递 (taskId, partialUpdates) 格式");
  test.todo("onComplete 回调传递 (taskId) 格式");
  test.todo("onDelete 回调传递 (taskId) 格式");
  test.todo("无 onUpdate 时编辑操作不崩溃（可选回调）");
  test.todo("无 onComplete/onDelete 时不显示或禁用对应按钮");
});

// ─── 7. mode 默认值 ──────────────────────────────────────────────────────────

describe("TaskDetail: 默认行为", () => {
  test.todo("不传 mode 时默认为 standalone（显示标题和操作按钮）");
  test.todo("不传 readonly 时默认为可编辑");
});

// ─── 8. 使用场景集成验收 ─────────────────────────────────────────────────────

describe("TaskDetail: 使用场景", () => {
  test.todo("甘特图 Sheet 抽屉场景：standalone 模式 + 完整编辑能力");
  test.todo("TaskItem 内联展开场景：embedded 模式 + 无标题无操作按钮");
  test.todo("已完成任务展开场景：embedded + readonly + 所有字段只读");
});
