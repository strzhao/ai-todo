import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { completeTask, deleteTask, updateTask, pinTask, unpinTask, getTaskForUser, TaskValidationError } from "@/lib/db";
import { aiFlowLog, getAiTraceIdFromHeaders } from "@/lib/ai-flow-log";
import { createRouteTimer } from "@/lib/route-timing";
import type { ParsedTask } from "@/lib/types";

export const preferredRegion = "hkg1";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = getAiTraceIdFromHeaders(req.headers);
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { complete?: boolean; action?: "pin" | "unpin"; invite_mode?: string } & Partial<ParsedTask> & { assignee_email?: string | null; assigneeEmail?: string | null; start_date?: string | null; end_date?: string | null; parent_id?: string | null };
  aiFlowLog("tasks.patch.request", {
    trace_id: traceId ?? null,
    task_id: id,
    action: body.action ?? null,
    complete: body.complete ?? false,
    parent_id: body.parent_id ?? null,
    assignee_email: body.assignee_email ?? body.assigneeEmail ?? null,
    title: body.title ?? null,
  });

  try {
    if (body.action === "pin") {
      const task = await rt.track("db_query", async () =>
        pinTask(id, user.id, user.email, { invite_mode: body.invite_mode === "approval" ? "approval" : "open" })
      );
      aiFlowLog("tasks.patch.pin", {
        trace_id: traceId ?? null,
        task_id: task.id,
      });
      return rt.json(task);
    }

    if (body.action === "unpin") {
      // Verify ownership before unpinning
      const existing = await rt.track("db_query", async () => getTaskForUser(id, user.id));
      if (!existing) return rt.json({ error: "Not found" }, { status: 404 });
      if (existing.user_id !== user.id) return rt.json({ error: "Only owner can unpin" }, { status: 403 });
      await rt.track("db_query", async () => unpinTask(id));
      aiFlowLog("tasks.patch.unpin", {
        trace_id: traceId ?? null,
        task_id: id,
      });
      return rt.json({ ok: true });
    }

    if (body.complete) {
      const task = await rt.track("db_query", async () => completeTask(id, user.id));
      aiFlowLog("tasks.patch.complete", {
        trace_id: traceId ?? null,
        task_id: task.id,
      });
      return rt.json(task);
    }

    const task = await rt.track("db_query", async () => updateTask(id, user.id, body));
    if (!task) return rt.json({ error: "Not found" }, { status: 404 });
    aiFlowLog("tasks.patch.updated", {
      trace_id: traceId ?? null,
      task_id: task.id,
      parent_id: task.parent_id ?? null,
      assignee_email: task.assignee_email ?? null,
      title: task.title,
    });
    return rt.json(task);
  } catch (e) {
    if (e instanceof Error && e.message === "Task not found") {
      return rt.json({ error: "Not found" }, { status: 404 });
    }
    if (e instanceof TaskValidationError) {
      return rt.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = getAiTraceIdFromHeaders(req.headers);
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await rt.track("db_query", async () => deleteTask(id, user.id));
  aiFlowLog("tasks.delete", {
    trace_id: traceId ?? null,
    task_id: id,
  });
  return rt.empty(204);
}
