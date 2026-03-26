import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getTasks, getTodayTasks, getCompletedTasks, createTask, getTaskById } from "@/lib/db";
import { requireSpaceMember } from "@/lib/spaces";
import { aiFlowLog, getAiTraceIdFromHeaders } from "@/lib/ai-flow-log";
import { createRouteTimer } from "@/lib/route-timing";
import { fireNotifications } from "@/lib/notifications";
import type { CreateNotificationParams } from "@/lib/notifications";
import type { ParsedTask, Task } from "@/lib/types";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  const filter = req.nextUrl.searchParams.get("filter") as string | null;
  const spaceId = req.nextUrl.searchParams.get("space_id") ?? undefined;
  const typeParam = req.nextUrl.searchParams.get("type");

  if (spaceId) {
    try {
      await rt.track("db_query", async () => requireSpaceMember(spaceId, user.id));
    } catch {
      return rt.json({ error: "Not a space member" }, { status: 403 });
    }
  }

  // type=1 → notes only; type=0 or omitted → tasks only (backward compat)
  const wantType = typeParam === "1" ? 1 : 0;

  let tasks;
  if (wantType === 1) {
    // Notes: optionally scoped to a space, type filter pushed to DB
    tasks = await rt.track("db_query", async () =>
      getTasks(user.id, spaceId ? { spaceId, type: 1 } : { type: 1 })
    );
    tasks = tasks.sort(
      (a: Task, b: Task) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  } else if (filter === "today") {
    tasks = await rt.track("db_query", async () => getTodayTasks(user.id, spaceId));
    tasks = tasks.filter((t: Task) => (t.type ?? 0) === 0);
  } else if (filter === "assigned") {
    tasks = await rt.track("db_query", async () =>
      getTasks(user.id, { filter: "assigned", type: 0 })
    );
  } else if (filter === "completed") {
    const before = req.nextUrl.searchParams.get("before") ?? undefined;
    const beforeId = req.nextUrl.searchParams.get("before_id") ?? undefined;
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = Math.min(limitParam ? parseInt(limitParam, 10) || 20 : 20, 50);
    const { tasks: completedTasks, hasMore } = await rt.track("db_query", async () =>
      getCompletedTasks(user.id, spaceId, 0, { limit, before, beforeId })
    );
    return rt.json(completedTasks, {
      headers: {
        "Cache-Control": "private, max-age=0, stale-while-revalidate=10",
        "X-Has-More": String(hasMore),
      },
    });
  } else {
    tasks = await rt.track("db_query", async () => getTasks(user.id, { spaceId, type: 0 }));
  }

  return rt.json(tasks, {
    headers: {
      "Cache-Control": "private, max-age=0, stale-while-revalidate=10",
    },
  });
}

export async function POST(req: NextRequest) {
  const traceId = getAiTraceIdFromHeaders(req.headers);
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as ParsedTask & {
    space_id?: string;
    assignee_email?: string;
    parent_id?: string;
    type?: 0 | 1;
  };
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

  // Validate parent_id exists + auto-inherit space_id from parent
  if (body.parent_id) {
    const parent = await rt.track("db_query", async () => getTaskById(body.parent_id!));
    if (!parent) {
      return rt.json({ error: "Parent task not found" }, { status: 400 });
    }
    // Auto-inherit space_id: pinned parent → use parent's own ID; otherwise use parent's space_id
    if (!body.space_id) {
      body.space_id = parent.pinned ? parent.id : (parent.space_id ?? undefined);
    }
    // Cross-space check: parent must belong to same space
    if (body.space_id) {
      const parentSpace = parent.pinned ? parent.id : parent.space_id;
      if (parentSpace !== body.space_id) {
        return rt.json(
          { error: "Parent task does not belong to the specified space" },
          { status: 400 }
        );
      }
    }
  }

  if (body.space_id) {
    try {
      await rt.track("db_query", async () => requireSpaceMember(body.space_id!, user.id));
    } catch {
      return rt.json({ error: "Not a space member" }, { status: 403 });
    }
  }

  // Resolve assignee user_id from task members
  const assigneeEmail = body.assignee_email ?? body.assignee ?? undefined;
  let assigneeId: string | undefined;

  if (assigneeEmail && body.space_id) {
    const { sql } = await import("@vercel/postgres");
    const { rows } = await rt.track(
      "db_query",
      async () => sql`
      SELECT user_id FROM ai_todo_task_members
      WHERE task_id = ${body.space_id} AND email = ${assigneeEmail} AND status = 'active'
    `
    );
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

  const task = await rt.track("db_query", async () =>
    createTask(user.id, {
      ...body,
      spaceId: body.space_id,
      assigneeId,
      assigneeEmail,
      mentionedEmails: body.mentions ?? [],
      parentId: body.parent_id,
    })
  );

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
          if (
            mentionedUserId &&
            mentionedUserId !== user.id &&
            mentionedUserId !== task.assignee_id
          ) {
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
