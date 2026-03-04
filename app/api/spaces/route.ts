import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getPinnedTasksForUser, createPinnedTask } from "@/lib/db";
import { createRouteTimer } from "@/lib/route-timing";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  const spaces = await rt.track("db_query", async () => getPinnedTasksForUser(user.id));
  // Map title → name for legacy SpaceNav compatibility
  return rt.json(spaces.map((t) => ({ ...t, name: t.title })));
}

export async function POST(req: NextRequest) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { name?: string; description?: string; invite_mode?: string };
  if (!body.name?.trim()) {
    return rt.json({ error: "name is required" }, { status: 400 });
  }

  const task = await rt.track("db_query", async () => createPinnedTask(user.id, user.email, {
    title: body.name!.trim(),
    description: body.description?.trim() || undefined,
    invite_mode: body.invite_mode === "approval" ? "approval" : "open",
  }));

  return rt.json({ ...task, name: task.title }, { status: 201 });
}
