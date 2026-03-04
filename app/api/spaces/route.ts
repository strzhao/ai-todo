import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getSpacesByUser, createSpace } from "@/lib/db";
import { createRouteTimer } from "@/lib/route-timing";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  const spaces = await rt.track("db_query", async () => getSpacesByUser(user.id));
  return rt.json(spaces);
}

export async function POST(req: NextRequest) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { name?: string; description?: string; invite_mode?: string };
  if (!body.name?.trim()) {
    return rt.json({ error: "name is required" }, { status: 400 });
  }
  const name = body.name.trim();

  const space = await rt.track("db_query", async () => createSpace(user.id, user.email, {
    name,
    description: body.description?.trim() || undefined,
    invite_mode: body.invite_mode === "approval" ? "approval" : "open",
  }));

  return rt.json(space, { status: 201 });
}
