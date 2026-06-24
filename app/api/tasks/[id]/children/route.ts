import { type NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, getChildTasks, getDescendantTasks, getTaskForUser } from "@/lib/db";
import { buildTree } from "@/lib/task-utils";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initDb();
  const { id } = await params;

  // Verify user has access to the parent task
  const parentTask = await getTaskForUser(id, user.id);
  if (!parentTask) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const recursive = req.nextUrl.searchParams.get("recursive") === "true";

  // Get child tasks
  const tasks = recursive ? await getDescendantTasks(id) : await getChildTasks(id);

  // Build tree structure
  const tree = buildTree(tasks);

  return NextResponse.json(tree);
}
