import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, completeTask, reopenTask, deleteTask, updateTask, pinTask, unpinTask, getTaskForUser, setShareCode, generateShareCode, TaskValidationError } from "@/lib/db";
import { TaskPermissionError } from "@/lib/task-permissions";
import { sql } from "@vercel/postgres";
import { aiFlowLog, getAiTraceIdFromHeaders } from "@/lib/ai-flow-log";
import { createRouteTimer } from "@/lib/route-timing";
import { fireNotification, fireNotifications } from "@/lib/notifications";
import type { ParsedTask } from "@/lib/types";

export const preferredRegion = "hkg1";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const traceId = getAiTraceIdFromHeaders(req.headers);
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();
  const { id } = await params;
  const body = await req.json() as { complete?: boolean; reopen?: boolean; action?: "pin" | "unpin" | "share" | "unshare"; invite_mode?: string } & Partial<ParsedTask> & { assignee_email?: string | null; assigneeEmail?: string | null; start_date?: string | null; end_date?: string | null; parent_id?: string | null; progress?: number; type?: 0 | 1 };
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

    if (body.action === "share") {
      const existing = await rt.track("db_query", async () => getTaskForUser(id, user.id));
      if (!existing) return rt.json({ error: "Not found" }, { status: 404 });
      if ((existing.type ?? 0) !== 1) return rt.json({ error: "Only notes can be shared" }, { status: 400 });
      // 空间笔记：任何能看到的成员可分享；个人笔记：仅创建者
      if (!existing.space_id && existing.user_id !== user.id) {
        return rt.json({ error: "Only creator can share" }, { status: 403 });
      }
      if (existing.share_code) {
        return rt.json({ share_code: existing.share_code, share_url: `${process.env.APP_ORIGIN || ""}/shared/${existing.share_code}` });
      }
      let code = generateShareCode();
      const { rows: dup } = await sql`SELECT 1 FROM ai_todo_tasks WHERE share_code = ${code}`;
      if (dup.length > 0) code = generateShareCode();
      await rt.track("db_query", async () => setShareCode(id, code));
      return rt.json({ share_code: code, share_url: `${process.env.APP_ORIGIN || ""}/shared/${code}` });
    }

    if (body.action === "unshare") {
      const existing = await rt.track("db_query", async () => getTaskForUser(id, user.id));
      if (!existing) return rt.json({ error: "Not found" }, { status: 404 });
      // 空间笔记：任何能看到的成员可取消分享；个人笔记：仅创建者
      if (!existing.space_id && existing.user_id !== user.id) {
        return rt.json({ error: "Only creator can unshare" }, { status: 403 });
      }
      await rt.track("db_query", async () => setShareCode(id, null));
      return rt.json({ ok: true });
    }

    if (body.complete) {
      const before = await rt.track("db_query", async () => getTaskForUser(id, user.id));
      const task = await rt.track("db_query", async () => completeTask(id, user.id));
      aiFlowLog("tasks.patch.complete", {
        trace_id: traceId ?? null,
        task_id: task.id,
      });
      // Notify assignee (if not self)
      if (before?.assignee_id && before.assignee_id !== user.id) {
        fireNotification({
          userId: before.assignee_id,
          type: "task_completed",
          title: `${user.email.split("@")[0]} 完成了你负责的任务`,
          body: task.title,
          taskId: task.id,
          spaceId: task.space_id,
          actorId: user.id,
          actorEmail: user.email,
        });
      }
      return rt.json(task);
    }

    if (body.reopen) {
      const task = await rt.track("db_query", async () => reopenTask(id, user.id));
      aiFlowLog("tasks.patch.reopen", {
        trace_id: traceId ?? null,
        task_id: task.id,
      });
      return rt.json(task);
    }

    // Read task before update to detect assignee changes
    const before = await rt.track("db_query", async () => getTaskForUser(id, user.id));
    const task = await rt.track("db_query", async () => updateTask(id, user.id, body));
    if (!task) return rt.json({ error: "Not found" }, { status: 404 });
    aiFlowLog("tasks.patch.updated", {
      trace_id: traceId ?? null,
      task_id: task.id,
      parent_id: task.parent_id ?? null,
      assignee_email: task.assignee_email ?? null,
      title: task.title,
    });
    // Notify on assignee change
    if (before && task.assignee_id !== before.assignee_id) {
      const actorName = user.email.split("@")[0];
      const notifs = [];
      // New assignee
      if (task.assignee_id && task.assignee_id !== user.id) {
        notifs.push({
          userId: task.assignee_id,
          type: "task_assigned" as const,
          title: `${actorName} 给你指派了任务`,
          body: task.title,
          taskId: task.id,
          spaceId: task.space_id,
          actorId: user.id,
          actorEmail: user.email,
        });
      }
      // Previous assignee
      if (before.assignee_id && before.assignee_id !== user.id) {
        notifs.push({
          userId: before.assignee_id,
          type: "task_reassigned" as const,
          title: `${actorName} 将任务重新指派给了其他人`,
          body: task.title,
          taskId: task.id,
          spaceId: task.space_id,
          actorId: user.id,
          actorEmail: user.email,
        });
      }
      if (notifs.length) fireNotifications(notifs);
    }
    return rt.json(task);
  } catch (e) {
    if (e instanceof TaskPermissionError) {
      return rt.json({ error: e.message }, { status: 403 });
    }
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
  // Read task before deleting to get assignee info
  await initDb();
  try {
    const taskBefore = await rt.track("db_query", async () => getTaskForUser(id, user.id));
    await rt.track("db_query", async () => deleteTask(id, user.id));
    aiFlowLog("tasks.delete", {
      trace_id: traceId ?? null,
      task_id: id,
    });
    // Notify assignee (if not self)
    if (taskBefore?.assignee_id && taskBefore.assignee_id !== user.id) {
      fireNotification({
        userId: taskBefore.assignee_id,
        type: "task_deleted",
        title: `${user.email.split("@")[0]} 删除了你负责的任务`,
        body: taskBefore.title,
        spaceId: taskBefore.space_id,
        actorId: user.id,
        actorEmail: user.email,
      });
    }
    return rt.empty(204);
  } catch (e) {
    if (e instanceof TaskPermissionError) {
      return rt.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }
}
