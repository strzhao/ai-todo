// oss-ops demo GIF 录制：核心动线 = NL 输入 → AI 解析 → 预览 diff → 全部执行
// 用法：node scripts/demo-capture.mjs en|zh   （en=空状态起手；zh=seed 任务树背景）
// 产物：/tmp/oss-ops-capture-<lang>.webm（后由 ffmpeg 转 GIF）
import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";

const lang = process.argv[2];
if (lang !== "en" && lang !== "zh") {
  console.error("usage: node scripts/demo-capture.mjs en|zh");
  process.exit(1);
}
const BASE = "http://localhost:4000";

const SCENE =
  lang === "en"
    ? {
        clean: true,
        seed: [
          'Read "Harness Engineering Principles" notes',
          "Weekly review: write release notes",
          "Ship v0.13|bilingual README|English demo GIF",
        ],
        sentence: "Make the weekly review high priority, due tomorrow 3pm",
        typeDelay: 35,
      }
    : {
        clean: true,
        seed: [
          "发布 ai-todo v0.13|完成双语 README|录制英文 demo GIF|准备 V2EX 发布帖",
          "每周五：写周报",
          "读《harness 工程原则》并记笔记",
        ],
        sentence: "把写周报改成高优先级，明天下午三点截止",
        typeDelay: 60,
      };
// seed 项含 "|" = 父子树（首项为父，余为子）

const api = (path, opts) =>
  fetch(`${BASE}${path}`, opts).then((r) =>
    r.ok ? r.json().catch(() => ({})) : Promise.reject(r.status)
  );

// —— 数据准备：clean → seed ——
const list = await api("/api/tasks");
for (const t of list.tasks ?? list) await fetch(`${BASE}/api/tasks/${t.id}`, { method: "DELETE" });
if (SCENE.seed.length) {
  for (const item of SCENE.seed) {
    const [parent, ...children] = item.split("|");
    const p = await api("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: parent }),
    });
    for (const c of children)
      await api("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: c, parent_id: p.id }),
      });
  }
}

// —— 录制 ——
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: "/tmp", size: { width: 1280, height: 800 } },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.evaluate(() => {
  // 隐藏 bypass 的 DEV 徽章
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode()))
    if (n.textContent.trim() === "DEV") {
      n.parentElement.style.display = "none";
      break;
    }
});
await page.waitForTimeout(1500); // 开场停顿：让观众看清初始状态

const input = page.locator("textarea");
await input.click();
await input.pressSequentially(SCENE.sentence, { delay: SCENE.typeDelay });
await page.waitForTimeout(400);
await page.getByRole("button", { name: "AI 解析" }).click();

const execBtn = page.locator("button", { hasText: /^全部执行/ });
await execBtn.waitFor({ timeout: 25000 }); // AI 解析（DeepSeek）延迟不可控
await page.waitForTimeout(1300); // 停：看预览 diff
await execBtn.click();
await page.waitForTimeout(2800); // 收尾：看更新落列表（P1 徽章/日期变化）

await ctx.close(); // 关 context 才落盘 video
await browser.close();
const vid = execSync("ls -t /tmp/*.webm | head -1").toString().trim();
console.log(`captured [${lang}]: ${vid}`);
