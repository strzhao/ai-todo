import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getTaskForUser, getTaskLogs, addTaskLog } from "@/lib/db";
import { createRouteTimer } from "@/lib/route-timing";
import { fireNotifications } from "@/lib/notifications";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const task = await rt.track("db_query", async () => getTaskForUser(id, user.id));
  if (!task) return rt.json({ error: "Not found" }, { status: 404 });

  const logs = await rt.track("db_query", async () => getTaskLogs(id));
  return rt.json(logs);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const task = await rt.track("db_query", async () => getTaskForUser(id, user.id));
  if (!task) return rt.json({ error: "Not found" }, { status: 404 });

  const { content } = await req.json() as { content?: string };
  if (!content?.trim()) return rt.json({ error: "content is required" }, { status: 400 });

  const log = await rt.track("db_query", async () => addTaskLog(id, user.id, user.email, content.trim()));

  // Notify task owner + assignee (if not self)
  const notifs = [];
  const actorName = user.email.split("@")[0];
  if (task.user_id !== user.id) {
    notifs.push({
      userId: task.user_id,
      type: "task_log_added" as const,
      title: `${actorName} 给任务添加了进展`,
      body: `${task.title}: ${content.trim().slice(0, 100)}`,
      taskId: task.id,
      spaceId: task.space_id,
      actorId: user.id,
      actorEmail: user.email,
    });
  }
  if (task.assignee_id && task.assignee_id !== user.id && task.assignee_id !== task.user_id) {
    notifs.push({
      userId: task.assignee_id,
      type: "task_log_added" as const,
      title: `${actorName} 给任务添加了进展`,
      body: `${task.title}: ${content.trim().slice(0, 100)}`,
      taskId: task.id,
      spaceId: task.space_id,
      actorId: user.id,
      actorEmail: user.email,
    });
  }
  if (notifs.length) fireNotifications(notifs);

  return rt.json(log, { status: 201 });
}
