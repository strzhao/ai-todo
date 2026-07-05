import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// 红队验收测试（黑盒）：analytics 接入静态契约
// 基于设计文档逐字断言，不读实现运行时行为。
// 覆盖契约：C1（layout 渲染 <Analytics />）、C2（.env.example 4 个 umami 变量）、
//           C5（反向契约：全仓不出现 register_success）、C6（package.json 依赖）
// 覆盖谓词：P1（layout 含 <Analytics />）、P2（grep register_success 无命中）、P4（.env.example 含 4 变量）

// 根目录发现：从当前文件向上查找含 package.json 的目录。
// 这样测试无论落在 acceptance-staging/（5 层深）还是 __tests__/（1 层深）都能正确定位。
function findProjectRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("无法定位项目根（未找到 package.json）");
}
const ROOT = findProjectRoot(__dirname);
const LAYOUT_PATH = path.join(ROOT, "app/layout.tsx");
const ENV_EXAMPLE_PATH = path.join(ROOT, ".env.example");
const PACKAGE_JSON_PATH = path.join(ROOT, "package.json");

// 设计契约 C2：.env.example 必须包含这 4 个 umami 变量（逐字一致）
const REQUIRED_UMAMI_ENV_VARS = [
  "NEXT_PUBLIC_UMAMI_HOST",
  "NEXT_PUBLIC_UMAMI_WEBSITE_ID",
  "UMAMI_HOST",
  "UMAMI_WEBSITE_ID",
] as const;

function readSource(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`源文件不存在: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf-8");
}

describe("[C6/P1] package.json 声明 @stringzhao/analytics-sdk 依赖", () => {
  it("dependencies 含 @stringzhao/analytics-sdk", () => {
    const pkg = JSON.parse(readSource(PACKAGE_JSON_PATH));
    expect(
      pkg.dependencies,
      "package.json dependencies 必须包含 @stringzhao/analytics-sdk"
    ).toHaveProperty("@stringzhao/analytics-sdk");
  });
});

describe("[C1/P1] app/layout.tsx 渲染 <Analytics />", () => {
  it("layout.tsx 存在", () => {
    expect(fs.existsSync(LAYOUT_PATH)).toBe(true);
  });

  it("layout.tsx 从 @stringzhao/analytics-sdk 导入 Analytics 组件", () => {
    const src = readSource(LAYOUT_PATH);
    // 必须出现 import 语句，且来源是 SDK 包名（逐字一致）
    expect(src).toContain("@stringzhao/analytics-sdk");
    expect(src).toMatch(
      /import\s+\{[^}]*\bAnalytics\b[^}]*\}\s+from\s+["']@stringzhao\/analytics-sdk["']/
    );
  });

  it("layout.tsx <body> 内渲染 <Analytics /> 组件", () => {
    const src = readSource(LAYOUT_PATH);
    // 设计契约 D1：<Analytics /> 放根 layout，<body> 内
    expect(src, "<body> 标签必须存在").toMatch(/<body/);
    expect(src, "必须渲染 <Analytics />").toMatch(/<Analytics\s*\/?>/);
  });
});

describe("[C2/P4] .env.example 含全部 4 个 umami 变量", () => {
  it(".env.example 文件存在", () => {
    expect(fs.existsSync(ENV_EXAMPLE_PATH), `.env.example 必须存在: ${ENV_EXAMPLE_PATH}`).toBe(
      true
    );
  });

  it(".env.example 包含契约要求的 4 个 umami 变量（逐字一致）", () => {
    const src = readSource(ENV_EXAMPLE_PATH);
    for (const varName of REQUIRED_UMAMI_ENV_VARS) {
      expect(src, `.env.example 必须包含变量: ${varName}`).toContain(varName);
    }
  });

  it.each(REQUIRED_UMAMI_ENV_VARS)(".env.example 含变量 %s（独立断言，定位用）", (varName) => {
    const src = readSource(ENV_EXAMPLE_PATH);
    // 出现形式为 `VAR_NAME=` 赋值行，而非被注释掉的样例注释里偶然提及
    expect(src).toMatch(new RegExp(`^\\s*${varName}\\s*=`, "m"));
  });
});

describe("[C5/P2] 反向契约：全仓不引入 register_success 埋点", () => {
  // 设计决策 D2 + 反向契约 C5：本项目无注册流程，严禁出现 register_success 事件。
  // 谓词 P2：grep -rn register_success app lib → 必须无命中（rc=1）
  function walkTsFiles(dir: string, acc: string[] = []): string[] {
    if (!fs.existsSync(dir)) return acc;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      // 跳过 node_modules / .next / 测试暂存区自身，避免误报
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkTsFiles(full, acc);
      } else if (
        /\.(ts|tsx|js|jsx|mjs)$/.test(entry.name) &&
        !entry.name.endsWith(".test.ts") &&
        !entry.name.endsWith(".acceptance.test.ts")
      ) {
        acc.push(full);
      }
    }
    return acc;
  }

  it("app/ 与 lib/ 下任何源码文件均不含字符串 register_success", () => {
    const dirs = [path.join(ROOT, "app"), path.join(ROOT, "lib")];
    const violations: string[] = [];
    for (const dir of dirs) {
      for (const file of walkTsFiles(dir)) {
        const src = fs.readFileSync(file, "utf-8");
        if (src.includes("register_success")) {
          violations.push(file);
        }
      }
    }
    expect(
      violations,
      `反向契约被违反：以下文件出现 register_success：\n${violations.join("\n")}`
    ).toEqual([]);
  });

  it("全仓（app + lib + components）grep register_success 必须无命中", () => {
    // 等价于 `grep -rn register_success app lib components`（排除测试文件自身）
    const dirs = [path.join(ROOT, "app"), path.join(ROOT, "lib"), path.join(ROOT, "components")];
    let hitCount = 0;
    for (const dir of dirs) {
      for (const file of walkTsFiles(dir)) {
        const src = fs.readFileSync(file, "utf-8");
        if (src.includes("register_success")) hitCount++;
      }
    }
    expect(hitCount, "register_success 必须零命中").toBe(0);
  });
});
