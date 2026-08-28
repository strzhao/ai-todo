import { test, expect } from "@playwright/test";

/**
 * 回归测试：完成任务后任务应立即从活跃列表消失（无需刷新页面）。
 *
 * 历史根因：GET /api/tasks 曾设置 `stale-while-revalidate=10`，浏览器在窗口内
 * 向客户端 SWR 的 revalidation 请求返回 HTTP 缓存旧 body，覆盖乐观更新，
 * 导致完成的任务"复活"；刷新页面后才消失。修复后响应头为 private, no-store。
 * 前置：dev server（AUTH_DEV_BYPASS=true，见 CLAUDE.md 本地开发配置）。
 */
test("完成任务后无需刷新即从活跃列表消失", async ({ page }) => {
  test.setTimeout(90_000);

  const title = `[QA-AC3] 验收任务 ${Date.now().toString(36)}`;
  let taskId: string | undefined;

  try {
    // 1. 通过 API 创建任务
    const createRes = await page.request.post("/api/tasks", { data: { title } });
    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    taskId = created.id;
    expect(taskId).toBeTruthy();

    // 2. 打开首页，等待任务出现在活跃列表
    await page.goto("/");
    const row = page.locator(`[aria-label="任务: ${title}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });

    // 3. 点击完成按钮
    await row.locator('button[aria-label="完成任务"]').click();

    // 4. 不刷新页面，断言任务行从 DOM 消失（乐观更新未被旧响应覆盖）。
    //    超时给 30s：本地 dev 首次命中 [id] 路由需编译，且 initDb 每请求 15 条 DDL
    //    在远程 DB（~95ms RTT）上合计数秒——PATCH 完成前 TaskItem 仅置灰、不移除，
    //    属预期交互（避免 PATCH 失败时撒谎）；生产 DB 为 localhost 无此延迟。
    await expect(row).toHaveCount(0, { timeout: 30_000 });
  } finally {
    // 5. 清理：无论断言成败都删除临时任务
    if (taskId) {
      await page.request.delete(`/api/tasks/${taskId}`);
    }
  }
});
