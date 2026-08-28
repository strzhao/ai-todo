// oss-ops 演示数据 seed：为 AUTH_DEV_USER_ID=oss-ops-demo 建一组上镜任务（中文版 GIF 背景）
// 用法：node scripts/seed-demo.mjs [--clean]
const BASE = process.env.SEED_BASE ?? "http://localhost:4000";

async function create(title, parentId) {
  const res = await fetch(`${BASE}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parentId ? { title, parent_id: parentId } : { title }),
  });
  if (!res.ok) throw new Error(`create "${title}" -> ${res.status}`);
  return res.json();
}

if (process.argv.includes("--clean")) {
  const list = await (await fetch(`${BASE}/api/tasks`)).json();
  const tasks = list.tasks ?? list;
  for (const t of tasks) {
    const r = await fetch(`${BASE}/api/tasks/${t.id}`, { method: "DELETE" });
    console.log(r.ok ? `del ${t.title}` : `FAIL del ${t.title}`);
  }
  process.exit(0);
}

const parent = await create("发布 ai-todo v0.13");
for (const c of ["完成双语 README", "录制英文 demo GIF", "准备 V2EX 发布帖"])
  await create(c, parent.id);
await create("每周五：写周报");
await create("读《harness 工程原则》并记笔记");
console.log("seeded 6 tasks for oss-ops-demo");
