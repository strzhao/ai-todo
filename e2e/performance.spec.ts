import { test, expect, type Page } from "@playwright/test";

/**
 * Web Vitals 性能断言（P2）。必须在 prod build 上跑（见 playwright.perf.config.ts）。
 *
 * 覆盖范围：公开页 `/readme` 首屏管线（LCP / CLS / FCP / TTFB）—— 含 React 渲染、
 * JS bundle 解析执行、客户端 hydration、CSS / 字体加载。
 *
 * 为何不测主应用页（/, /all, /spaces/[id]）：lib/auth.ts 的 DEV_BYPASS 硬性要求
 * NODE_ENV !== "production"，prod build（next start）下认证页必被重定向到登录，
 * synthetic 测试进不去。主应用的线上性能由 RUM（npm run perf:vercel-report）监控。
 * INP 需交互场景，暂未覆盖（TODO）。
 */

type Vitals = { lcp: number; cls: number; fcp: number; ttfb: number };

/** 在页面任何脚本前注入 PerformanceObserver 采集器。 */
async function attachVitals(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __vitals: { lcp: number; cls: number; fcp: number };
    };
    w.__vitals = { lcp: 0, cls: 0, fcp: 0 };

    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__vitals.lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });

    new PerformanceObserver((list) => {
      type Shift = PerformanceEntry & { hadRecentInput?: boolean; value: number };
      for (const e of list.getEntries() as Shift[]) {
        if (!e.hadRecentInput) w.__vitals.cls += e.value;
      }
    }).observe({ type: "layout-shift", buffered: true });

    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.name === "first-contentful-paint") w.__vitals.fcp = e.startTime;
      }
    }).observe({ type: "paint", buffered: true });
  });
}

async function readVitals(page: Page): Promise<Vitals> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __vitals: { lcp: number; cls: number; fcp: number };
    };
    const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    const ttfb = nav ? nav.responseStart - nav.requestStart : 0;
    return { ...w.__vitals, ttfb };
  });
}

async function waitForStable(page: Page, ms = 3000) {
  // 不用 networkidle：今日视图有 30s 通知轮询会让它永不 idle。用 load + 固定等待让 LCP 稳定。
  await page.waitForLoadState("load");
  await page.waitForTimeout(ms);
}

// Google "Good" 基线。本地 prod build 无 CDN / 无真实网络延迟，留出冷启动余量。
const LIMIT = { lcp: 2500, cls: 0.1, fcp: 1800, ttfb: 800 } as const;

function assertVitals(v: Vitals, limit: typeof LIMIT) {
  const ms = (n: number) => `${Math.round(n)}ms`;
  // expect.soft：一次报告所有超标项，不因首个失败就停
  expect.soft(v.lcp, `LCP ${ms(v.lcp)} > ${ms(limit.lcp)}`).toBeLessThan(limit.lcp);
  expect.soft(v.cls, `CLS ${v.cls.toFixed(3)} > ${limit.cls}`).toBeLessThan(limit.cls);
  expect.soft(v.fcp, `FCP ${ms(v.fcp)} > ${ms(limit.fcp)}`).toBeLessThan(limit.fcp);
  expect.soft(v.ttfb, `TTFB ${ms(v.ttfb)} > ${ms(limit.ttfb)}`).toBeLessThan(limit.ttfb);
}

test.describe("Web Vitals (prod build)", () => {
  test("/readme 公开页首屏指标", async ({ page }) => {
    await attachVitals(page);
    await page.goto("/readme", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    const v = await readVitals(page);
    console.log("[perf] /readme", v);
    assertVitals(v, LIMIT);
  });
});
