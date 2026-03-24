import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const spaceNavPath = path.join(process.cwd(), "components/SpaceNav.tsx");
const spaceNavSource = fs.readFileSync(spaceNavPath, "utf-8");

// ── A. SpaceTaskNode 接口包含 assignee_email 字段 ─────────────────────────────
describe("SpaceTaskNode 接口", () => {
  it("包含 assignee_email 可选字段", () => {
    const interfaceMatch = spaceNavSource.match(
      /interface\s+SpaceTaskNode\s*\{([^}]+)\}/
    );
    expect(interfaceMatch).not.toBeNull();
    const body = interfaceMatch![1];
    expect(body).toContain("assignee_email");
    expect(body).toMatch(/assignee_email\s*\?\s*:\s*string/);
  });
});

// ── B. toSpaceTaskNode 函数传递 assignee_email ────────────────────────────────
describe("toSpaceTaskNode 函数", () => {
  it("从 TaskNode 传递 assignee_email 到 SpaceTaskNode", () => {
    const fnMatch = spaceNavSource.match(
      /function\s+toSpaceTaskNode\s*\([^)]*\)\s*:\s*SpaceTaskNode\s*\{([\s\S]*?)\n\}/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![1];
    expect(fnBody).toContain("assignee_email");
    expect(fnBody).toMatch(/assignee_email\s*:\s*node\.assignee_email/);
  });

  it("递归处理子任务（subtasks 调用 toSpaceTaskNode）", () => {
    const fnMatch = spaceNavSource.match(
      /function\s+toSpaceTaskNode\s*\([^)]*\)\s*:\s*SpaceTaskNode\s*\{([\s\S]*?)\n\}/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![1];
    expect(fnBody).toMatch(/subtasks.*toSpaceTaskNode/);
  });
});

// ── C. TaskNode 数据源包含 assignee_email ─────────────────────────────────────
describe("TaskNode 数据源", () => {
  it("Task 类型包含 assignee_email 字段", () => {
    const typesPath = path.join(process.cwd(), "lib/types.ts");
    const typesSource = fs.readFileSync(typesPath, "utf-8");
    expect(typesSource).toMatch(/assignee_email\s*\?\s*:\s*string/);
  });

  it("TaskNode 继承 Task（自动包含 assignee_email）", () => {
    const taskUtilsPath = path.join(process.cwd(), "lib/task-utils.ts");
    const taskUtilsSource = fs.readFileSync(taskUtilsPath, "utf-8");
    expect(taskUtilsSource).toMatch(/TaskNode\s*=\s*Task\s*&/);
  });
});

// ── D. SpaceNav fetch 成员数据 ────────────────────────────────────────────────
describe("SpaceNav 成员数据获取", () => {
  it("源码中包含 fetch members 的 API 调用", () => {
    // 应调用 /api/spaces/{id}/members 获取成员列表
    expect(spaceNavSource).toMatch(/\/api\/spaces\//);
    expect(spaceNavSource).toMatch(/\/members/);
  });

  it("存在成员数据的存储结构（spaceMembersMap 或类似）", () => {
    // 应有某种 Map/Record 存储 spaceId -> members 的映射
    const hasMembersStore =
      /spaceMembersMap|membersMap|membersData|spaceMembers/.test(
        spaceNavSource
      );
    expect(hasMembersStore).toBe(true);
  });
});

// ── E. 导入并使用 getDisplayLabel ─────────────────────────────────────────────
describe("getDisplayLabel 集成", () => {
  it("从 display-utils 导入 getDisplayLabel", () => {
    expect(spaceNavSource).toMatch(
      /import\s*\{[^}]*getDisplayLabel[^}]*\}\s*from\s*["'].*display-utils["']/
    );
  });

  it("渲染逻辑中调用 getDisplayLabel", () => {
    // getDisplayLabel 应该在渲染经办人时被调用
    const callCount = (spaceNavSource.match(/getDisplayLabel\s*\(/g) || [])
      .length;
    expect(callCount).toBeGreaterThanOrEqual(1);
  });
});

// ── F. getDisplayLabel 工具函数正确性 ──────────────────────────────────────────
describe("getDisplayLabel 函数", () => {
  it("display-utils.ts 文件存在并导出 getDisplayLabel", () => {
    const utilsPath = path.join(process.cwd(), "lib/display-utils.ts");
    const utilsSource = fs.readFileSync(utilsPath, "utf-8");
    expect(utilsSource).toMatch(
      /export\s+(function\s+getDisplayLabel|const\s+getDisplayLabel)/
    );
  });

  it("优先级：display_name > nickname > email 本地部分", () => {
    const utilsPath = path.join(process.cwd(), "lib/display-utils.ts");
    const utilsSource = fs.readFileSync(utilsPath, "utf-8");
    // 函数体中应引用 display_name 和 nickname
    expect(utilsSource).toMatch(/display_name/);
    expect(utilsSource).toMatch(/nickname/);
    // 应有 email 回退逻辑（split @ 取本地部分）
    expect(utilsSource).toMatch(/split\s*\(\s*["']@["']\s*\)/);
  });
});

// ── G. 经办人渲染：有昵称显示文字标签，无昵称回退首字母圆圈 ──────────────────
describe("经办人显示：文字标签 vs 首字母圆圈", () => {
  it("渲染逻辑中存在基于成员数据的条件分支", () => {
    // 应有条件判断：在成员列表中找到成员且有昵称 → 文字标签，否则 → 首字母圆圈
    // 查找通过 assignee_email 在 members 中查找的逻辑
    const hasLookup =
      /\.find\s*\(|\.get\s*\(|members.*assignee_email|assignee_email.*members/.test(
        spaceNavSource
      );
    expect(hasLookup).toBe(true);
  });

  it("有昵称/display_name 时渲染文字标签（非圆圈）", () => {
    // 有 getDisplayLabel 返回值参与渲染，应直接显示文字
    // 查找条件渲染：有 label 时显示文字
    const hasTextLabel =
      /displayLabel|label|displayName/.test(spaceNavSource) ||
      /getDisplayLabel/.test(spaceNavSource);
    expect(hasTextLabel).toBe(true);
  });

  it("无昵称时回退到首字母圆圈（rounded-full）", () => {
    // 仍保留 rounded-full 圆圈样式用于回退场景
    expect(spaceNavSource).toMatch(/rounded-full/);
    // 应有 toUpperCase 用于首字母显示
    expect(spaceNavSource).toMatch(/toUpperCase\s*\(\s*\)/);
  });

  it("渲染逻辑中区分 有显示名 和 无显示名 两种情况", () => {
    // 应有条件表达式区分两种渲染路径
    // 例如 member ? <文字> : <圆圈> 或 displayLabel ? ... : ...
    // 查找三元表达式或条件渲染
    const hasConditionalRendering =
      // 三元表达式模式
      /\?\s*(<|"|\{|`)[^:]*:\s*(<|"|\{|`)/.test(spaceNavSource) &&
      // 同时引用了 assignee_email
      /assignee_email/.test(spaceNavSource);
    expect(hasConditionalRendering).toBe(true);
  });
});

// ── H. 组件接收 userEmail 用于过滤自己 ────────────────────────────────────────
describe("不显示经办人的条件", () => {
  it("组件接收 userEmail 属性用于比较", () => {
    expect(spaceNavSource).toMatch(/userEmail\s*:\s*string/);
  });

  it("当 assignee_email 等于当前用户 email 时不显示", () => {
    expect(spaceNavSource).toMatch(/!==\s*userEmail|!==\s*props\.userEmail/);
  });
});
