import { describe, it, expect } from "vitest";

// ── A. SWR hooks 存在性和接口契约 ──────────────────────────────────────────────

describe("SWR hooks 模块 (lib/use-tasks.ts)", () => {
  it("导出 useTasks 函数", async () => {
    const mod = await import("@/lib/use-tasks");
    expect(typeof mod.useTasks).toBe("function");
  });

  it("导出 useCompletedTasks 函数", async () => {
    const mod = await import("@/lib/use-tasks");
    expect(typeof mod.useCompletedTasks).toBe("function");
  });

  it("导出 useNotes 函数", async () => {
    const mod = await import("@/lib/use-tasks");
    expect(typeof mod.useNotes).toBe("function");
  });

  it("导出 mutateTasks 函数", async () => {
    const mod = await import("@/lib/use-tasks");
    expect(typeof mod.mutateTasks).toBe("function");
  });

  it("mutateTasks 可以无参数调用不抛错", async () => {
    const mod = await import("@/lib/use-tasks");
    expect(() => mod.mutateTasks()).not.toThrow();
  });
});

// ── B. type 过滤下推到数据库 ──────────────────────────────────────────────────

describe("getTasks type 过滤", () => {
  it("getTasks 接受 type 参数 (接口兼容)", async () => {
    const mod = await import("@/lib/db");
    // 验证 getTasks 函数接受 options.type 参数（不会报类型错误）
    expect(typeof mod.getTasks).toBe("function");
    // 函数签名应支持 { type: number } 选项
    // 实际调用需要数据库连接，这里只验证函数存在
  });

  it("getCompletedTasks 接受 type 参数 (接口兼容)", async () => {
    const mod = await import("@/lib/db");
    expect(typeof mod.getCompletedTasks).toBe("function");
    // getCompletedTasks(userId, spaceId?, type?) 应该接受第三个参数
    expect(mod.getCompletedTasks.length).toBeGreaterThanOrEqual(1);
  });
});

// ── C. 布局并行化验证 ──────────────────────────────────────────────────────────

describe("布局查询并行化", () => {
  it("layout.tsx 中 getSpacesByUser 和 getOrgsForUser 应该并行调用", async () => {
    // 通过读取源文件验证 Promise.all 模式
    const fs = await import("fs");
    const path = await import("path");
    const layoutPath = path.join(process.cwd(), "app/(app)/layout.tsx");
    const content = fs.readFileSync(layoutPath, "utf-8");

    // 验证使用了 Promise.all
    expect(content).toContain("Promise.all");
    // 验证 getSpacesByUser 和 getOrgsForUser 在同一个 Promise.all 中
    const promiseAllMatch = content.match(/Promise\.all\(\[[\s\S]*?\]\)/);
    expect(promiseAllMatch).toBeTruthy();
    const promiseAllBlock = promiseAllMatch![0];
    expect(promiseAllBlock).toContain("getSpacesByUser");
    expect(promiseAllBlock).toContain("getOrgsForUser");
  });
});

// ── D. API Cache-Control 头 ──────────────────────────────────────────────────

describe("API Cache-Control 头", () => {
  it("tasks route GET 应返回 stale-while-revalidate Cache-Control", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const routePath = path.join(process.cwd(), "app/api/tasks/route.ts");
    const content = fs.readFileSync(routePath, "utf-8");

    // 验证响应包含 Cache-Control 头
    expect(content).toContain("Cache-Control");
    expect(content).toContain("stale-while-revalidate");
  });
});
