import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getTasks, getTodayTasks, getCompletedTasks, createTask, initDb, getSpaceMemberRecord } from "@/lib/db";
import type { ParsedTask } from "@/lib/types";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();

  const filter = req.nextUrl.searchParams.get("filter") as string | null;
  const spaceId = req.nextUrl.searchParams.get("space_id") ?? undefined;

  if (spaceId) {
    const member = await getSpaceMemberRecord(spaceId, user.id);
    if (!member || member.status !== "active") {
      return NextResponse.json({ error: "Not a space member" }, { status: 403 });
    }
  }

  let tasks;
  if (filter === "today") {
    tasks = await getTodayTasks(user.id, spaceId);
  } else if (filter === "assigned") {
    tasks = await getTasks(user.id, { filter: "assigned" });
  } else if (filter === "completed") {
    tasks = await getCompletedTasks(user.id, spaceId);
  } else {
    tasks = await getTasks(user.id, { spaceId });
  }

  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();

  const body = await req.json() as ParsedTask & { space_id?: string; assignee_email?: string; parent_id?: string };
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  if (body.space_id) {
    const member = await getSpaceMemberRecord(body.space_id, user.id);
    if (!member || member.status !== "active") {
      return NextResponse.json({ error: "Not a space member" }, { status: 403 });
    }
  }

  // Enforce max 2 levels: parent must be a root task (no parent_id)
  if (body.parent_id) {
    const { sql } = await import("@vercel/postgres");
    const { rows } = await sql`SELECT parent_id FROM ai_todo_tasks WHERE id = ${body.parent_id}`;
    if (!rows[0]) return NextResponse.json({ error: "父任务不存在" }, { status: 400 });
    if (rows[0].parent_id) return NextResponse.json({ error: "最多支持 2 层任务" }, { status: 400 });
  }

  // Resolve assignee user_id from space members list
  const assigneeEmail = body.assignee_email ?? body.assignee ?? undefined;
  let assigneeId: string | undefined;

  if (assigneeEmail && body.space_id) {
    const { sql } = await import("@vercel/postgres");
    const { rows } = await sql`
      SELECT user_id FROM ai_todo_space_members
      WHERE space_id = ${body.space_id} AND email = ${assigneeEmail} AND status = 'active'
    `;
    if (rows[0]) assigneeId = rows[0].user_id as string;
  }

  const task = await createTask(user.id, {
    ...body,
    spaceId: body.space_id,
    assigneeId,
    assigneeEmail,
    mentionedEmails: body.mentions ?? [],
    parentId: body.parent_id,
  });

  return NextResponse.json(task, { status: 201 });
}
