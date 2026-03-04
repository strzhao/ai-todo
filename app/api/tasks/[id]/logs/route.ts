import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getTaskForUser, getTaskLogs, addTaskLog } from "@/lib/db";
import { createRouteTimer } from "@/lib/route-timing";

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
  return rt.json(log, { status: 201 });
}
