// oss-ops social preview 生产：Sage 色系两候选（英文版 / 双语中性版）→ playwright 截图
// 用法：node scripts/capture-social.mjs  → 产物 /tmp/social-{en,bi}.png + og-image
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const ICON =
  "data:image/png;base64," +
  readFileSync(new URL("../public/icon-512.png", import.meta.url)).toString("base64");

const tpl = ({
  title,
  sub,
  tag,
  domain,
  bi = false,
}) => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; font-family: -apple-system, "SF Pro Display", "PingFang SC", "Segoe UI", sans-serif; }
  body { width: 1280px; height: 640px; background: #F7F6F1; overflow: hidden; position: relative; display: flex; align-items: center; }
  .arc { position: absolute; right: -220px; top: -260px; width: 720px; height: 720px; border-radius: 50%; background: #E8F2EE; }
  .arc2 { position: absolute; right: -140px; bottom: -300px; width: 520px; height: 520px; border-radius: 50%; background: #E8F2EE; opacity: .7; }
  .bar { position: absolute; left: 0; top: 0; bottom: 0; width: 14px; background: #3A7D68; }
  .wrap { padding: 0 96px; display: flex; align-items: center; gap: 56px; z-index: 1; }
  .icon { width: 176px; height: 176px; border-radius: 44px; box-shadow: 0 24px 48px rgba(26,26,24,.14); }
  h1 { font-size: 92px; font-weight: 800; color: #1A1A18; letter-spacing: -2px; }
  h1 .accent { color: #3A7D68; }
  .sub { margin-top: 22px; font-size: 34px; color: #595957; line-height: 1.45; max-width: 780px; }
  .sub-zh { margin-top: 10px; font-size: 27px; color: #8F8F8D; }
  .foot { position: absolute; left: 96px; bottom: 56px; display: flex; align-items: center; gap: 14px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #3A7D68; }
  .domain { font-size: 26px; color: #3A7D68; font-weight: 600; }
  .tag { position: absolute; right: 72px; bottom: 52px; font-size: 24px; color: #8F8F8D; }
</style></head><body>
  <div class="arc"></div><div class="arc2"></div><div class="bar"></div>
  <div class="wrap">
    <img class="icon" src="${ICON}">
    <div>
      <h1>AI <span class="accent">Todo</span></h1>
      <div class="sub">${sub}</div>
      ${bi ? `<div class="sub-zh">一句话创建、更新、完成任务 —— 先预览，再执行</div>` : ""}
    </div>
  </div>
  <div class="foot"><div class="dot"></div><div class="domain">${domain}</div></div>
  <div class="tag">${tag}</div>
</body></html>`;

const VARIANTS = {
  en: {
    title: "AI Todo",
    sub: "Natural-language tasks for humans & AI agents —<br>type one sentence, preview, done.",
    tag: "Open Source · NL-first · Agent CLI",
    domain: "ai-todo.stringzhao.life",
  },
  bi: {
    title: "AI Todo",
    sub: "Natural-language tasks for humans & AI agents",
    tag: "Open Source · NL-first · Agent CLI",
    domain: "ai-todo.stringzhao.life",
    bi: true,
  },
};

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 640 },
  deviceScaleFactor: 1,
});
for (const [name, v] of Object.entries(VARIANTS)) {
  await page.setContent(tpl(v), { waitUntil: "networkidle" });
  await page.screenshot({ path: `/tmp/social-${name}.png` }); // 1280×640 social preview
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.screenshot({ path: `/tmp/og-${name}.png` }); // 1200×630 og-image
  console.log(`captured social-${name}.png + og-${name}.png`);
}
await browser.close();
