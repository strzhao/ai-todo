import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is required");
  }

  const { migrateDb } = await import("../lib/db.ts");
  const startedAt = Date.now();
  await migrateDb();
  const elapsed = Date.now() - startedAt;
  console.log(`[db:migrate] completed in ${elapsed}ms`);
}

main().catch((err) => {
  console.error("[db:migrate] failed");
  console.error(err);
  process.exit(1);
});
