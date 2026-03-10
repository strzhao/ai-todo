import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getTasks, getTodayTasks, getCompletedTasks, createTask, getTaskMemberRecord } from "@/lib/db";
import { aiFlowLog, getAiTraceIdFromHeaders } from "@/lib/ai-flow-log";
import { createRouteTimer } from "@/lib/route-timing";
import { fireNotifications } from "@/lib/notifications";
import type { CreateNotificationParams } from "@/lib/notifications";
import type { ParsedTask } from "@/lib/types";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  const filter = req.nextUrl.searchParams.get("filter") as string | null;
  const spaceId = req.nextUrl.searchParams.get("space_id") ?? undefined;

  if (spaceId) {
    const member = await rt.track("db_query", async () => getTaskMemberRecord(spaceId, user.id));
    if (!member || member.status !== "active") {
      return rt.json({ error: "Not a space member" }, { status: 403 });
    }
  }

  let tasks;
  if (filter === "today") {
    tasks = await rt.track("db_query", async () => getTodayTasks(user.id, spaceId));
  } else if (filter === "assigned") {
    tasks = await rt.track("db_query", async () => getTasks(user.id, { filter: "assigned" }));
  } else if (filter === "completed") {
    tasks = await rt.track("db_query", async () => getCompletedTasks(user.id, spaceId));
  } else {
    tasks = await rt.track("db_query", async () => getTasks(user.id, { spaceId }));
  }

  return rt.json(tasks);
}

export async function POST(req: NextRequest) {
  const traceId = getAiTraceIdFromHeaders(req.headers);
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as ParsedTask & { space_id?: string; assignee_email?: string; parent_id?: string };
  aiFlowLog("tasks.post.request", {
    trace_id: traceId ?? null,
    title: body.title,
    parent_id: body.parent_id ?? null,
    space_id: body.space_id ?? null,
    assignee_email: body.assignee_email ?? body.assignee ?? null,
  });
  if (!body.title?.trim()) {
    return rt.json({ error: "title is required" }, { status: 400 });
  }

  if (body.space_id) {
    const member = await rt.track("db_query", async () => getTaskMemberRecord(body.space_id!, user.id));
    if (!member || member.status !== "active") {
      return rt.json({ error: "Not a space member" }, { status: 403 });
    }
  }

  // Resolve assignee user_id from task members
  const assigneeEmail = body.assignee_email ?? body.assignee ?? undefined;
  let assigneeId: string | undefined;

  if (assigneeEmail && body.space_id) {
    const { sql } = await import("@vercel/postgres");
    const { rows } = await rt.track("db_query", async () => sql`
      SELECT user_id FROM ai_todo_task_members
      WHERE task_id = ${body.space_id} AND email = ${assigneeEmail} AND status = 'active'
    `);
    if (rows[0]) assigneeId = rows[0].user_id as string;
  }

  aiFlowLog("tasks.post.resolved-payload", {
    trace_id: traceId ?? null,
    title: body.title,
    parent_id: body.parent_id ?? null,
    space_id: body.space_id ?? null,
    assignee_email: assigneeEmail ?? null,
    assignee_id: assigneeId ?? null,
  });

  const task = await rt.track("db_query", async () => createTask(user.id, {
    ...body,
    spaceId: body.space_id,
    assigneeId,
    assigneeEmail,
    mentionedEmails: body.mentions ?? [],
    parentId: body.parent_id,
  }));

  aiFlowLog("tasks.post.created", {
    trace_id: traceId ?? null,
    task_id: task.id,
    title: task.title,
    parent_id: task.parent_id ?? null,
    space_id: task.space_id ?? null,
  });

  // Fire notifications (non-blocking)
  void (async () => {
    try {
      const notifs: CreateNotificationParams[] = [];
      const actorName = user.email.split("@")[0];

      if (task.assignee_id && task.assignee_id !== user.id) {
        notifs.push({
          userId: task.assignee_id,
          type: "task_assigned",
          title: `${actorName} 给你指派了任务`,
          body: task.title,
          taskId: task.id,
          spaceId: task.space_id,
          actorId: user.id,
          actorEmail: user.email,
        });
      }

      if (task.mentioned_emails?.length && task.space_id) {
        const { sql: pgSql } = await import("@vercel/postgres");
        for (const email of task.mentioned_emails) {
          const { rows } = await pgSql`
            SELECT user_id FROM ai_todo_task_members
            WHERE task_id = ${task.space_id} AND email = ${email} AND status = 'active'
          `;
          const mentionedUserId = rows[0]?.user_id as string | undefined;
          if (mentionedUserId && mentionedUserId !== user.id && mentionedUserId !== task.assignee_id) {
            notifs.push({
              userId: mentionedUserId,
              type: "task_mentioned",
              title: `${actorName} 在任务中提到了你`,
              body: task.title,
              taskId: task.id,
              spaceId: task.space_id,
              actorId: user.id,
              actorEmail: user.email,
            });
          }
        }
      }

      if (notifs.length) fireNotifications(notifs);
    } catch (err) {
      console.error("[notification] task create error:", err);
    }
  })();

  return rt.json(task, { status: 201 });
}
