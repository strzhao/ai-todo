import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is required");
  }

  const { sql } = await import("@vercel/postgres");
  const { migrateDb } = await import("../lib/db.ts");

  const startedAt = Date.now();

  // Step 1: Run initDb (creates new tables & adds columns idempotently)
  await migrateDb();
  console.log("[db:migrate] initDb completed");

  // Step 2: Migrate ai_todo_spaces → pinned tasks in ai_todo_tasks
  // Check if ai_todo_spaces table still exists
  const { rows: tableExists } = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'ai_todo_spaces'
  `;

  if (tableExists.length > 0) {
    console.log("[db:migrate] migrating spaces → pinned tasks...");

    // 2a. For each space, insert a corresponding pinned task (reuse same UUID)
    const { rows: spaces } = await sql`SELECT * FROM ai_todo_spaces`;
    console.log(`[db:migrate] found ${spaces.length} spaces to migrate`);

    for (const space of spaces) {
      await sql`
        INSERT INTO ai_todo_tasks (
          id, user_id, title, description, pinned, invite_code, invite_mode,
          tags, mentioned_emails, created_at
        ) VALUES (
          ${space.id}, ${space.owner_id}, ${space.name}, ${space.description},
          TRUE, ${space.invite_code}, ${space.invite_mode},
          '{}', '{}', ${space.created_at}
        )
        ON CONFLICT (id) DO UPDATE SET
          pinned = TRUE,
          invite_code = EXCLUDED.invite_code,
          invite_mode = EXCLUDED.invite_mode
      `;

      // 2b. Copy space members → task members
      await sql`
        INSERT INTO ai_todo_task_members (task_id, user_id, email, display_name, role, status, joined_at)
        SELECT ${space.id}, user_id, email, display_name, role, status, joined_at
        FROM ai_todo_space_members
        WHERE space_id = ${space.id}
        ON CONFLICT (task_id, user_id) DO NOTHING
      `;
    }
    console.log("[db:migrate] spaces and members migrated");

    // Step 3: Fix space_id FK constraint (drop old → add new pointing to tasks)
    console.log("[db:migrate] updating space_id FK constraint...");
    await sql`ALTER TABLE ai_todo_tasks DROP CONSTRAINT IF EXISTS ai_todo_tasks_space_id_fkey`;
    await sql`
      ALTER TABLE ai_todo_tasks
      ADD CONSTRAINT ai_todo_tasks_space_id_fkey
      FOREIGN KEY (space_id) REFERENCES ai_todo_tasks(id) ON DELETE SET NULL
    `;
    console.log("[db:migrate] FK constraint updated");

    // Step 4: Verify no orphaned space_id references
    const { rows: orphaned } = await sql`
      SELECT COUNT(*) AS cnt FROM ai_todo_tasks t
      WHERE t.space_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM ai_todo_tasks p WHERE p.id = t.space_id)
    `;
    const orphanCount = Number(orphaned[0]?.cnt ?? 0);
    if (orphanCount > 0) {
      console.warn(`[db:migrate] WARNING: ${orphanCount} tasks have orphaned space_id — setting to NULL`);
      await sql`
        UPDATE ai_todo_tasks SET space_id = NULL
        WHERE space_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM ai_todo_tasks p WHERE p.id = space_id)
      `;
    }

    // Step 5: Drop old tables
    console.log("[db:migrate] dropping old tables...");
    await sql`DROP TABLE IF EXISTS ai_todo_space_members`;
    await sql`DROP TABLE IF EXISTS ai_todo_spaces`;
    console.log("[db:migrate] old tables dropped");
  } else {
    console.log("[db:migrate] no ai_todo_spaces table found, skipping migration");
  }

  const elapsed = Date.now() - startedAt;
  console.log(`[db:migrate] completed in ${elapsed}ms`);
}

main().catch((err) => {
  console.error("[db:migrate] failed");
  console.error(err);
  process.exit(1);
});
