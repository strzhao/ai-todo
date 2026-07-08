import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// 红队验收测试（黑盒）：D5 版本升级 + changelog 条目
// 覆盖设计决策 D5：0.10.4 → 0.11.0 + changelog

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
const PACKAGE_JSON_PATH = path.join(ROOT, "package.json");
const CHANGELOG_PATH = path.join(ROOT, "lib/changelog.ts");

function readSource(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`源文件不存在: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf-8");
}

describe("[D5] 版本号升级(已从 0.10.4 升级,>= 0.11.0)", () => {
  it("package.json version >= 0.11.0(D5 升级后后续可更高,动态断言避免硬编码)", () => {
    const pkg = JSON.parse(readSource(PACKAGE_JSON_PATH));
    const [maj, min] = String(pkg.version).split(".").map(Number);
    expect(maj, "version 必须有效").toBeTypeOf("number");
    expect(maj > 0 || (maj === 0 && min >= 11), `version ${pkg.version} 必须 >= 0.11.0`).toBe(true);
  });

  it("package.json version 不再是旧版本 0.10.4", () => {
    const pkg = JSON.parse(readSource(PACKAGE_JSON_PATH));
    expect(pkg.version, "版本必须已从 0.10.4 升级").not.toBe("0.10.4");
  });
});

describe("[D5] changelog.ts 新增 analytics 接入条目", () => {
  it("changelog 最新版本为 1.48.0（数组首项，产品版本 1.x 体系）", () => {
    const src = readSource(CHANGELOG_PATH);
    // 数组首项 version: "1.48.0"（最新条目排最前；changelog 为 1.x 产品版本体系，
    // 历史 latest 为 1.47.0，须 > 1.47.0 避免已升级用户误触"有新版本"红点）
    expect(src).toMatch(/version:\s*["']1\.48\.0["']/);
  });

  it("changelog 首项版本严格大于历史最新 1.47.0（单调递增，防 getLatestVersion 回退）", () => {
    const src = readSource(CHANGELOG_PATH);
    const match = src.match(/version:\s*["']([^"']+)["']/);
    expect(match, "changelog 必须有至少一个版本条目").not.toBeNull();
    const latest = match![1];
    const toNum = (v: string) =>
      v
        .split(".")
        .map((n) => parseInt(n, 10) || 0)
        .reduce((acc, p, i) => acc + p * Math.pow(1000, 2 - i), 0);
    expect(
      toNum(latest),
      `getLatestVersion()=${latest} 必须严格 > 1.47.0（历史最新，否则已升级用户会被误判"有新版本"）`
    ).toBeGreaterThan(toNum("1.47.0"));
  });

  it("changelog 条目提及 analytics SDK 接入", () => {
    const src = readSource(CHANGELOG_PATH);
    // 设计决策 D5：changelog 记录大功能。条目应提及 SDK 或 analytics 或 Umami
    const hasAnalyticsMention =
      src.includes("@stringzhao/analytics-sdk") ||
      src.toLowerCase().includes("analytics") ||
      src.toLowerCase().includes("umami");
    expect(hasAnalyticsMention, "changelog 0.11.0 条目必须提及 analytics 接入").toBe(true);
  });

  it("changelog 条目提及 login_success 转化埋点", () => {
    const src = readSource(CHANGELOG_PATH);
    expect(src.includes("login_success"), "changelog 必须提及 login_success 转化事件").toBe(true);
  });
});
