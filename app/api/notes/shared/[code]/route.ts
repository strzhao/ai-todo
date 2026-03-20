import { NextRequest } from "next/server";
import { initDb, getTaskByShareCode } from "@/lib/db";
import { createRouteTimer } from "@/lib/route-timing";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const rt = createRouteTimer(req);
  await initDb();
  const { code } = await params;
  const task = await rt.track("db_query", async () => getTaskByShareCode(code));
  if (!task) return rt.json({ error: "Not found" }, { status: 404 });

  return rt.json({
    title: task.title,
    description: task.description ?? null,
    tags: task.tags,
    created_at: task.created_at,
  });
}
