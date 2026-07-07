#!/usr/bin/env node
/**
 * 数据迁移脚本:Vercel Neon(POSTGRES_URL)→ VPS PG(VPS_POSTGRES_URL)。
 *
 * 用法(需先建 SSH 隧道把 VPS PG 映射到 localhost:15432):
 *   ssh -i ~/.ssh/little-bee-vps -fN -o ExitOnForwardFailure=yes \
 *     -L 15432:127.0.0.1:5432 ubuntu@43.143.124.222
 *   POSTGRES_URL="postgresql://...@neon/ai_todo" \
 *   VPS_POSTGRES_URL="postgresql://littlebee:PWD@localhost:15432/ai_todo" \
 *   node scripts/migrate-data-to-vps.mjs
 *
 * 参照 HANDOFF-VPS-MIGRATION.md 步骤 2。仅 node --check 语法校验,不实际执行。
 */
import pg from "pg";

const TABLES = [
  "ai_todo_tasks",
  "ai_todo_task_members",
  "ai_todo_task_logs",
  "ai_todo_notifications",
  "ai_todo_activated_users",
  "ai_todo_space_api_tokens",
  "ai_todo_orgs",
  "ai_todo_org_members",
  "ai_todo_push_subscriptions",
];

async function main() {
  const sourceUrl = process.env.POSTGRES_URL;
  const targetUrl = process.env.VPS_POSTGRES_URL;

  if (!sourceUrl) {
    console.error("[migrate] 错误: POSTGRES_URL(源 Neon)未设置");
    process.exit(1);
  }
  if (!targetUrl) {
    console.error("[migrate] 错误: VPS_POSTGRES_URL(目标 VPS)未设置");
    process.exit(1);
  }

  const srcPool = new pg.Pool({
    connectionString: sourceUrl,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  const dstPool = new pg.Pool({
    connectionString: targetUrl,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  console.log("[migrate] 源:", maskUrl(sourceUrl));
  console.log("[migrate] 目标:", maskUrl(targetUrl));

  // 目标库先建表(幂等),保证 INSERT 能找到列
  // 注:建表逻辑在 lib/db.ts initDb,此处假设目标库已跑过 db:migrate 或下方 replica 模式下手动建。
  // 本脚本仅迁移数据,不负责建表 schema(见 HANDOFF 步骤 2.2 psql 建库 + 步骤 1 initDb)。

  // 禁 FK 约束,允许任意顺序 INSERT(父子表、自引用 parent_id)
  await dstPool.query("SET session_replication_role = replica");
  console.log("[migrate] 目标库已设 session_replication_role=replica");

  let totalRows = 0;
  for (const table of TABLES) {
    const srcRes = await srcPool.query(`SELECT * FROM ${table}`);
    if (srcRes.rows.length === 0) {
      console.log(`[migrate] ${table}: 源表为空,跳过`);
      continue;
    }

    const rows = srcRes.rows;
    console.log(`[migrate] ${table}: 读取 ${rows.length} 行`);

    // 幂等:先清空目标表(避免主键冲突)
    await dstPool.query(`DELETE FROM ${table}`);

    // 拿列名(从第一行推断;PG 关系模型保证所有行列名一致)
    const columns = Object.keys(rows[0]);
    if (columns.length === 0) {
      console.warn(`[migrate] ${table}: 无法推断列名,跳过`);
      continue;
    }

    const colList = columns.join(", ");
    const placeholders = (n) => `(${Array.from({ length: n }, (_, i) => `$${i + 1}`).join(", ")})`;

    let inserted = 0;
    for (const row of rows) {
      const values = columns.map((c) => row[c]);
      await dstPool.query(
        `INSERT INTO ${table} (${colList}) VALUES ${placeholders(columns.length)} ON CONFLICT DO NOTHING`,
        values
      );
      inserted++;
    }
    console.log(`[migrate] ${table}: 插入 ${inserted} 行`);
    totalRows += inserted;
  }

  // 恢复 FK 约束
  await dstPool.query("SET session_replication_role = origin");
  console.log("[migrate] 目标库已恢复 session_replication_role=origin");
  console.log(`[migrate] 完成,共迁移 ${totalRows} 行`);

  await srcPool.end();
  await dstPool.end();
  process.exit(0);
}

function maskUrl(url) {
  // 仅显示 host/db,屏蔽密码
  return url.replace(/\/\/[^@]+@/, "//***:***@");
}

main().catch((err) => {
  console.error("[migrate] 失败:", err);
  process.exit(1);
});
