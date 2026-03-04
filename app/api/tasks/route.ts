import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getTasks, getTodayTasks, getCompletedTasks, createTask, getSpaceMemberRecord } from "@/lib/db";
import { createRouteTimer } from "@/lib/route-timing";
import type { ParsedTask } from "@/lib/types";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  const filter = req.nextUrl.searchParams.get("filter") as string | null;
  const spaceId = req.nextUrl.searchParams.get("space_id") ?? undefined;

  if (spaceId) {
    const member = await rt.track("db_query", async () => getSpaceMemberRecord(spaceId, user.id));
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
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as ParsedTask & { space_id?: string; assignee_email?: string; parent_id?: string };
  if (!body.title?.trim()) {
    return rt.json({ error: "title is required" }, { status: 400 });
  }

  if (body.space_id) {
    const member = await rt.track("db_query", async () => getSpaceMemberRecord(body.space_id!, user.id));
    if (!member || member.status !== "active") {
      return rt.json({ error: "Not a space member" }, { status: 403 });
    }
  }

  // Enforce max 2 levels: parent must be a root task (no parent_id)
  if (body.parent_id) {
    const { sql } = await import("@vercel/postgres");
    const { rows } = await rt.track("db_query", async () => sql`SELECT parent_id FROM ai_todo_tasks WHERE id = ${body.parent_id}`);
    if (!rows[0]) return rt.json({ error: "父任务不存在" }, { status: 400 });
    if (rows[0].parent_id) return rt.json({ error: "最多支持 2 层任务" }, { status: 400 });
  }

  // Resolve assignee user_id from space members list
  const assigneeEmail = body.assignee_email ?? body.assignee ?? undefined;
  let assigneeId: string | undefined;

  if (assigneeEmail && body.space_id) {
    const { sql } = await import("@vercel/postgres");
    const { rows } = await rt.track("db_query", async () => sql`
        SELECT user_id FROM ai_todo_space_members
        WHERE space_id = ${body.space_id} AND email = ${assigneeEmail} AND status = 'active'
      `);
    if (rows[0]) assigneeId = rows[0].user_id as string;
  }

  const task = await rt.track("db_query", async () => createTask(user.id, {
    ...body,
    spaceId: body.space_id,
    assigneeId,
    assigneeEmail,
    mentionedEmails: body.mentions ?? [],
    parentId: body.parent_id,
  }));

  return rt.json(task, { status: 201 });
}
