import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { completeTask, deleteTask, updateTask } from "@/lib/db";
import { createRouteTimer } from "@/lib/route-timing";
import type { ParsedTask } from "@/lib/types";

export const preferredRegion = "hkg1";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { complete?: boolean } & Partial<ParsedTask> & { assignee_email?: string | null; start_date?: string | null; end_date?: string | null };

  try {
    if (body.complete) {
      const task = await rt.track("db_query", async () => completeTask(id, user.id));
      return rt.json(task);
    }
    const task = await rt.track("db_query", async () => updateTask(id, user.id, body));
    if (!task) return rt.json({ error: "Not found" }, { status: 404 });
    return rt.json(task);
  } catch (e) {
    if (e instanceof Error && e.message === "Task not found") {
      return rt.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await rt.track("db_query", async () => deleteTask(id, user.id));
  return rt.empty(204);
}
