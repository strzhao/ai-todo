import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { completeTask, deleteTask, updateTask, pinTask, unpinTask, getTaskForUser } from "@/lib/db";
import { createRouteTimer } from "@/lib/route-timing";
import type { ParsedTask } from "@/lib/types";

export const preferredRegion = "hkg1";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { complete?: boolean; action?: "pin" | "unpin"; invite_mode?: string } & Partial<ParsedTask> & { assignee_email?: string | null; start_date?: string | null; end_date?: string | null };

  try {
    if (body.action === "pin") {
      const task = await rt.track("db_query", async () =>
        pinTask(id, user.id, user.email, { invite_mode: body.invite_mode === "approval" ? "approval" : "open" })
      );
      return rt.json(task);
    }

    if (body.action === "unpin") {
      // Verify ownership before unpinning
      const existing = await rt.track("db_query", async () => getTaskForUser(id, user.id));
      if (!existing) return rt.json({ error: "Not found" }, { status: 404 });
      if (existing.user_id !== user.id) return rt.json({ error: "Only owner can unpin" }, { status: 403 });
      await rt.track("db_query", async () => unpinTask(id));
      return rt.json({ ok: true });
    }

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
