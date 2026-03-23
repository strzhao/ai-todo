import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const spaceNavPath = path.join(process.cwd(), "components/SpaceNav.tsx");
const spaceNavSource = fs.readFileSync(spaceNavPath, "utf-8");

// ── A. SpaceTaskNode 接口包含 assignee_email 字段 ─────────────────────────────

describe("SpaceTaskNode 接口", () => {
  it("包含 assignee_email 可选字段", () => {
    // 验证接口定义中包含 assignee_email
    const interfaceMatch = spaceNavSource.match(
      /interface\s+SpaceTaskNode\s*\{([^}]+)\}/
    );
    expect(interfaceMatch).not.toBeNull();
    const body = interfaceMatch![1];
    expect(body).toContain("assignee_email");
    // 应该是可选字段（带 ?）
    expect(body).toMatch(/assignee_email\s*\?\s*:\s*string/);
  });
});

// ── B. toSpaceTaskNode 函数传递 assignee_email ────────────────────────────────

describe("toSpaceTaskNode 函数", () => {
  it("从 TaskNode 传递 assignee_email 到 SpaceTaskNode", () => {
    // 验证函数体中包含 assignee_email 的赋值
    const fnMatch = spaceNavSource.match(
      /function\s+toSpaceTaskNode\s*\([^)]*\)\s*:\s*SpaceTaskNode\s*\{([\s\S]*?)\n\}/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![1];
    expect(fnBody).toContain("assignee_email");
    // 应该引用 node.assignee_email
    expect(fnBody).toMatch(/assignee_email\s*:\s*node\.assignee_email/);
  });

  it("递归处理子任务（subtasks 调用 toSpaceTaskNode）", () => {
    const fnMatch = spaceNavSource.match(
      /function\s+toSpaceTaskNode\s*\([^)]*\)\s*:\s*SpaceTaskNode\s*\{([\s\S]*?)\n\}/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![1];
    // 子任务也应该经过 toSpaceTaskNode 转换，保留 assignee_email
    expect(fnBody).toMatch(/subtasks.*toSpaceTaskNode/);
  });
});

// ── C. TaskNode 数据源包含 assignee_email ─────────────────────────────────────

describe("TaskNode 数据源", () => {
  it("Task 类型包含 assignee_email 字段", async () => {
    const typesPath = path.join(process.cwd(), "lib/types.ts");
    const typesSource = fs.readFileSync(typesPath, "utf-8");
    // Task 接口应包含 assignee_email
    expect(typesSource).toMatch(/assignee_email\s*\?\s*:\s*string/);
  });

  it("TaskNode 继承 Task（自动包含 assignee_email）", async () => {
    const taskUtilsPath = path.join(process.cwd(), "lib/task-utils.ts");
    const taskUtilsSource = fs.readFileSync(taskUtilsPath, "utf-8");
    // TaskNode = Task & { subtasks: TaskNode[] }
    expect(taskUtilsSource).toMatch(/TaskNode\s*=\s*Task\s*&/);
  });
});

// ── D. 侧边栏渲染经办人首字母圆圈逻辑 ────────────────────────────────────────

describe("经办人首字母圆圈渲染", () => {
  it("渲染函数中根据 assignee_email 显示首字母", () => {
    // renderSpaceTaskTree 或相关渲染逻辑应引用 assignee_email
    expect(spaceNavSource).toMatch(/assignee_email/);
    // 应该有条件判断：assignee_email 存在且不等于当前用户
    // 查找类似 node.assignee_email && node.assignee_email !== userEmail 的模式
    expect(spaceNavSource).toMatch(
      /assignee_email\s*&&\s*.*assignee_email\s*!==|assignee_email\s*!==.*&&/
    );
  });

  it("首字母取 email @ 前部分的第一个字符并大写", () => {
    // 验证源码中有从 email 提取首字母的逻辑
    // 常见模式: email.split('@')[0][0].toUpperCase() 或 email[0].toUpperCase() 或 email.charAt(0).toUpperCase()
    // 或者 .split("@")[0][0] 或 .split("@")[0].charAt(0)
    const hasInitialExtraction =
      // 模式1: split("@")[0][0] 或 split("@")[0].charAt(0)
      /split\s*\(\s*["']@["']\s*\)\s*\[\s*0\s*\]\s*\[\s*0\s*\]/.test(
        spaceNavSource
      ) ||
      /split\s*\(\s*["']@["']\s*\)\s*\[\s*0\s*\]\.charAt\s*\(\s*0\s*\)/.test(
        spaceNavSource
      ) ||
      // 模式2: 直接取 [0] 然后 toUpperCase
      /assignee_email\s*\[\s*0\s*\]/.test(spaceNavSource) ||
      /assignee_email\.charAt\s*\(\s*0\s*\)/.test(spaceNavSource) ||
      // 模式3: 某种 initial/avatar 工具函数
      /getInitial|avatarInitial|emailInitial/.test(spaceNavSource);

    expect(hasInitialExtraction).toBe(true);
  });

  it("首字母应大写显示", () => {
    // 应该有 .toUpperCase() 调用
    expect(spaceNavSource).toMatch(/toUpperCase\s*\(\s*\)/);
  });

  it("渲染为圆形元素", () => {
    // 应该有 rounded-full 样式用于显示圆形头像
    expect(spaceNavSource).toMatch(/rounded-full/);
  });
});

// ── E. 不显示经办人圆圈的条件 ────────────────────────────────────────────────

describe("不显示经办人圆圈的条件", () => {
  it("组件接收 userEmail 属性用于比较", () => {
    // Props 接口应包含 userEmail
    expect(spaceNavSource).toMatch(/userEmail\s*:\s*string/);
  });

  it("当 assignee_email 等于当前用户 email 时不显示", () => {
    // 渲染逻辑中应有与 userEmail 的比较
    // 查找 !== userEmail 或 !== props.userEmail 等模式
    expect(spaceNavSource).toMatch(/!==\s*userEmail|!==\s*props\.userEmail/);
  });
});
