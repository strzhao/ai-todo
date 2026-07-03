import { defineConfig, devices } from "@playwright/test";

/**
 * 性能断言专用配置：在 prod build 上跑（npm run build && next start --port 4001）。
 * 与功能冒烟测试（playwright.config.ts，dev server :4000）分离——
 * dev 模式 Web Vitals 虚高 3-10×（HMR / 未压缩 / 未优化），阈值无意义。
 *
 * 运行：npm run test:e2e:perf
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/performance.spec.ts"],
  fullyParallel: false,
  workers: 1, // 串行：并行会争抢资源污染性能指标
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:4001",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run start:perf",
    url: "http://localhost:4001",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000, // next build 可能较慢，给 5 min
  },
});
