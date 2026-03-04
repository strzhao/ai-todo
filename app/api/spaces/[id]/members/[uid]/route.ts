import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { updateTaskMember, removeTaskMember, getTaskMemberRecord } from "@/lib/db";
import { requireSpaceOwner } from "@/lib/spaces";
import { createRouteTimer } from "@/lib/route-timing";

export const preferredRegion = "hkg1";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; uid: string }> }
) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { id, uid } = await params;

  const body = await req.json() as { status?: string; display_name?: string; role?: string };

  const isSelf = uid === user.id;
  const updatingOthers = !isSelf || body.status !== undefined || body.role !== undefined;

  if (updatingOthers) {
    try {
      await rt.track("db_query", async () => requireSpaceOwner(id, user.id));
    } catch {
      return rt.json({ error: "Only owner can update other members" }, { status: 403 });
    }
  }

  const member = await rt.track("db_query", async () => updateTaskMember(id, uid, body));
  if (!member) return rt.json({ error: "Not found" }, { status: 404 });

  return rt.json(member);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; uid: string }> }
) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { id, uid } = await params;

  const isSelf = uid === user.id;

  if (!isSelf) {
    try {
      await rt.track("db_query", async () => requireSpaceOwner(id, user.id));
    } catch {
      return rt.json({ error: "Only owner can remove other members" }, { status: 403 });
    }
  }

  if (!isSelf) {
    const target = await rt.track("db_query", async () => getTaskMemberRecord(id, uid));
    if (target?.role === "owner") {
      return rt.json({ error: "Cannot remove the space owner" }, { status: 400 });
    }
  }

  await rt.track("db_query", async () => removeTaskMember(id, uid));
  return rt.empty(204);
}
