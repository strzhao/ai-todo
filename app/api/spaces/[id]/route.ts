import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getSpaceById, getSpaceMembers, updateSpace, deleteSpace } from "@/lib/db";
import { requireSpaceMember, requireSpaceOwner } from "@/lib/spaces";
import { createRouteTimer } from "@/lib/route-timing";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await rt.track("db_query", async () => requireSpaceMember(id, user.id));
  } catch {
    return rt.json({ error: "Not a space member" }, { status: 403 });
  }

  const [space, members] = await rt.track("db_query", async () => Promise.all([getSpaceById(id), getSpaceMembers(id)]));
  if (!space) return rt.json({ error: "Not found" }, { status: 404 });

  return rt.json({ space, members });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await rt.track("db_query", async () => requireSpaceOwner(id, user.id));
  } catch {
    return rt.json({ error: "Only owner can update space" }, { status: 403 });
  }

  const body = await req.json() as { name?: string; description?: string; invite_mode?: string };
  const space = await rt.track("db_query", async () => updateSpace(id, body));
  if (!space) return rt.json({ error: "Not found" }, { status: 404 });

  return rt.json(space);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await rt.track("db_query", async () => requireSpaceOwner(id, user.id));
  } catch {
    return rt.json({ error: "Only owner can delete space" }, { status: 403 });
  }

  await rt.track("db_query", async () => deleteSpace(id));
  return rt.empty(204);
}
