/**
 * T001 monorepo 迁移 —— 红队验收测试
 *
 * 信息来源：仅 `.autopilot/runtime/requirements/20260706-T001/state.md` 的
 * 设计文档 / 契约规约 / 验收场景（AC-T001-01 ~ AC-T001-10）。
 * 未读取蓝队实现代码（apps/web/ 下任何文件内容均未查看，仅在断言中按设计文档
 * 声明的路径进行存在性/内容校验）。
 *
 * 所有耗时命令（npm install / build / test / lint / ls --workspaces）在
 * beforeAll 中集中执行一次并缓存结果，各 AC 用例复用缓存结果做断言，避免
 * 重复触发昂贵操作。
 *
 * 运行方式：
 *   - 迁移完成前：`npx vitest run __tests__/acceptance/t001-monorepo-migration.acceptance.test.ts`
 *   - 迁移完成后（vitest.config.ts 随 __tests__/ 一起 git mv 到 apps/web/ 下）：
 *     `npm test --workspace apps/web -- t001-monorepo-migration` 或直接
 *     `npx vitest run` 命中默认 include glob（文件名以 .test.ts 结尾）。
 *   - 所有文件路径均基于 `git rev-parse --show-toplevel` 计算的仓库根目录，
 *     不依赖测试文件自身在仓库中的相对位置，因此迁移前后均可执行。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";

interface RunResult {
  rc: number;
  stdout: string;
  stderr: string;
}

function repoRoot(): string {
  return execSync("git rev-parse --show-toplevel", {
    encoding: "utf-8",
  }).trim();
}

const ROOT = repoRoot();

function run(cmd: string, opts: { cwd?: string; timeout?: number } = {}): RunResult {
  try {
    const stdout = execSync(cmd, {
      cwd: opts.cwd ?? ROOT,
      encoding: "utf-8",
      timeout: opts.timeout ?? 120_000,
      maxBuffer: 1024 * 1024 * 100,
    });
    return { rc: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status?: number | null; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      rc: typeof e.status === "number" ? e.status : 1,
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? "",
    };
  }
}

function readJson(relPath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(ROOT, relPath), "utf-8"));
}

function readText(relPath: string): string {
  return readFileSync(path.join(ROOT, relPath), "utf-8");
}

// ---------------------------------------------------------------------------
// 集中执行昂贵命令一次，供多个 AC 复用
// ---------------------------------------------------------------------------

let installResult: RunResult;
let lsWorkspacesResult: RunResult;
let buildResult: RunResult;
let testResult: RunResult;
let lintResult: RunResult;

beforeAll(() => {
  installResult = run("npm install", { timeout: 300_000 });
  lsWorkspacesResult = run("npm ls --workspaces --depth=0", { timeout: 60_000 });
  buildResult = run("npm run build", { timeout: 300_000 });
  testResult = run("npm test", { timeout: 300_000 });
  lintResult = run("npm run lint", { timeout: 180_000 });
}, 900_000);

// ---------------------------------------------------------------------------
// AC-T001-01: root workspaces 化 + npm install + workspace 列表含 ai-todo-web
// ---------------------------------------------------------------------------

describe("AC-T001-01: root package.json workspaces 化", () => {
  it("root package.json 含 workspaces: apps/* + packages/*", () => {
    const pkg = readJson("package.json");
    expect(pkg.workspaces).toBeTruthy();
    expect(pkg.workspaces).toEqual(expect.arrayContaining(["apps/*", "packages/*"]));
  });

  it("npm install（root）rc=0", () => {
    expect(installResult.rc).toBe(0);
  });

  it("npm ls --workspaces --depth=0 输出含 ai-todo-web", () => {
    const combined = lsWorkspacesResult.stdout + lsWorkspacesResult.stderr;
    expect(combined).toMatch(/ai-todo-web/);
  });
});

// ---------------------------------------------------------------------------
// AC-T001-02: web 零回归 —— build/test/lint 全通过，lint error 数为 0
// ---------------------------------------------------------------------------

describe("AC-T001-02: web 零回归（build/test/lint）", () => {
  it("npm run build（root 转发）rc=0", () => {
    expect(buildResult.rc).toBe(0);
  });

  it("npm test rc=0，且测试用例数 >= 732", () => {
    expect(testResult.rc).toBe(0);
    const combined = testResult.stdout + testResult.stderr;
    // vitest 汇总行形如 "Tests  732 passed (732)" 或含 skipped 的变体，
    // 括号内为总用例数，取该数值判断 >= 732。
    const totalMatch = combined.match(/Tests\s+.*\((\d+)\)/);
    expect(totalMatch).toBeTruthy();
    if (totalMatch) {
      expect(Number(totalMatch[1])).toBeGreaterThanOrEqual(732);
    }
  });

  it("npm run lint rc=0 且 error 数为 0", () => {
    expect(lintResult.rc).toBe(0);
    const combined = lintResult.stdout + lintResult.stderr;
    // eslint 汇总行形如 "X problems (Y errors, Z warnings)"；
    // 若无该汇总行（无 problems 输出）则视为 0 error。
    const summaryMatch = combined.match(/(\d+)\s+errors?/i);
    const errorCount = summaryMatch ? Number(summaryMatch[1]) : 0;
    expect(errorCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AC-T001-03: apps/web 是完整 Next.js 工程
// ---------------------------------------------------------------------------

describe("AC-T001-03: apps/web 是完整 Next.js 工程", () => {
  const requiredPaths = [
    "apps/web/package.json",
    "apps/web/next.config.ts",
    "apps/web/proxy.ts",
    "apps/web/app/(app)/layout.tsx",
  ];

  it.each(requiredPaths)("%s 存在", (relPath) => {
    expect(existsSync(path.join(ROOT, relPath))).toBe(true);
  });

  it("apps/web/package.json 的 name=ai-todo-web，version=0.11.0", () => {
    const pkg = readJson("apps/web/package.json");
    expect(pkg.name).toBe("ai-todo-web");
    expect(pkg.version).toBe("0.11.0");
  });
});

// ---------------------------------------------------------------------------
// AC-T001-04: SSR/proxy 未改，next.config 无 output: 'export'
// ---------------------------------------------------------------------------

describe("AC-T001-04: SSR/proxy 未改", () => {
  it("apps/web/app/(app)/layout.tsx 仍含 getServerUser 调用", () => {
    const content = readText("apps/web/app/(app)/layout.tsx");
    expect(content).toMatch(/getServerUser/);
  });

  it("apps/web/proxy.ts 存在", () => {
    expect(existsSync(path.join(ROOT, "apps/web/proxy.ts"))).toBe(true);
  });

  it("apps/web/next.config.ts 无 output: 'export'", () => {
    const content = readText("apps/web/next.config.ts");
    expect(content).not.toMatch(/output\s*:\s*["']export["']/);
  });
});

// ---------------------------------------------------------------------------
// AC-T001-05: vercel.json 含 build 配置指向 apps/web
// ---------------------------------------------------------------------------

describe("AC-T001-05: vercel.json 指向 apps/web", () => {
  it("buildCommand 与 outputDirectory 值正确", () => {
    const vercelConfig = readJson("vercel.json");
    expect(vercelConfig.buildCommand).toBe("npm run build --workspace apps/web");
    expect(vercelConfig.outputDirectory).toBe("apps/web/.next");
  });
});

// ---------------------------------------------------------------------------
// AC-T001-06: eslint flat config 留 root，apps/web 无独立配置
// ---------------------------------------------------------------------------

describe("AC-T001-06: eslint flat config 留 root", () => {
  it("root eslint.config.mjs 存在", () => {
    expect(existsSync(path.join(ROOT, "eslint.config.mjs"))).toBe(true);
  });

  it("apps/web 下无 eslint.config.*", () => {
    const result = run("ls apps/web/eslint.config.* 2>/dev/null");
    expect(result.stdout.trim()).toBe("");
  });
});

// ---------------------------------------------------------------------------
// AC-T001-07: root 脚本转发到 apps/web workspace
// ---------------------------------------------------------------------------

describe("AC-T001-07: root 脚本转发到 apps/web", () => {
  it.each(["dev", "build", "test", "lint"])("%s script 含 --workspace apps/web", (scriptName) => {
    const pkg = readJson("package.json");
    const scripts = pkg.scripts as Record<string, string>;
    expect(scripts[scriptName]).toMatch(/--workspace apps\/web/);
  });
});

// ---------------------------------------------------------------------------
// AC-T001-08: git mv 保留历史
// ---------------------------------------------------------------------------

describe("AC-T001-08: git 历史保留（git mv）", () => {
  it("git log --follow --oneline -- apps/web/proxy.ts 能追到迁移前的历史", () => {
    const result = run("git log --follow --oneline -- apps/web/proxy.ts");
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    // 历史应不止本次迁移这一条 commit，否则说明历史未被保留（用了 cp+rm 而非 git mv）
    expect(lines.length).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// AC-T001-09: .gitignore 净度（apps/web 产物被忽略）
// ---------------------------------------------------------------------------

describe("AC-T001-09: .gitignore 净度", () => {
  const artifactProbes = [
    "apps/web/node_modules/x",
    "apps/web/.next/x",
    "apps/web/coverage/x",
    "apps/web/test-results/x",
    "apps/web/playwright-report/x",
    "apps/web/blob-report/x",
  ];

  it.each(artifactProbes)("%s 被 git ignore", (probePath) => {
    const result = run(`git check-ignore ${probePath}`);
    expect(result.rc).toBe(0);
    expect(result.stdout.trim()).toBe(probePath);
  });

  it("git status --porcelain 不含产物路径", () => {
    const result = run("git status --porcelain");
    expect(result.stdout).not.toMatch(
      /apps\/web\/(node_modules|\.next|coverage|test-results|playwright-report|blob-report)\//
    );
  });
});

// ---------------------------------------------------------------------------
// AC-T001-10: CI workflow 的 tsc 步骤 workspace 感知
// ---------------------------------------------------------------------------

describe("AC-T001-10: CI workflow 适配 apps/web", () => {
  it(".github/workflows/ci.yml 的 tsc --noEmit 含 --project apps/web/tsconfig.json", () => {
    const content = readText(".github/workflows/ci.yml");
    expect(content).toMatch(/tsc --noEmit[^\n]*--project\s+apps\/web\/tsconfig\.json/);
  });
});
