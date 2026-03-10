import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { updateTaskMember, removeTaskMember, getTaskMemberRecord, getTaskById } from "@/lib/db";
import { createRouteTimer } from "@/lib/route-timing";
import { fireNotification } from "@/lib/notifications";

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
    const actor = await rt.track("db_query", async () => getTaskMemberRecord(id, user.id));
    if (!actor || (actor.role !== "owner" && actor.role !== "admin")) {
      return rt.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    // Only owner can change roles
    if (body.role !== undefined && actor.role !== "owner") {
      return rt.json({ error: "Only owner can change roles" }, { status: 403 });
    }
    // Admin cannot manage owner or other admins
    if (actor.role === "admin") {
      const target = await rt.track("db_query", async () => getTaskMemberRecord(id, uid));
      if (target && target.role !== "member") {
        return rt.json({ error: "Admin can only manage regular members" }, { status: 403 });
      }
    }
  }

  const memberBefore = await rt.track("db_query", async () => getTaskMemberRecord(id, uid));
  const member = await rt.track("db_query", async () => updateTaskMember(id, uid, body));
  if (!member) return rt.json({ error: "Not found" }, { status: 404 });

  // Notify member when approved (pending → active)
  if (memberBefore?.status === "pending" && body.status === "active" && uid !== user.id) {
    const space = await getTaskById(id);
    fireNotification({
      userId: uid,
      type: "space_member_approved",
      title: "你的加入申请已通过",
      body: space?.title,
      taskId: id,
      spaceId: id,
      actorId: user.id,
      actorEmail: user.email,
    });
  }

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
    const actor = await rt.track("db_query", async () => getTaskMemberRecord(id, user.id));
    if (!actor || (actor.role !== "owner" && actor.role !== "admin")) {
      return rt.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    const target = await rt.track("db_query", async () => getTaskMemberRecord(id, uid));
    if (target?.role === "owner") {
      return rt.json({ error: "Cannot remove the space owner" }, { status: 400 });
    }
    // Admin cannot remove owner or other admins
    if (actor.role === "admin" && target?.role === "admin") {
      return rt.json({ error: "Admin cannot remove other admins" }, { status: 403 });
    }
  }

  await rt.track("db_query", async () => removeTaskMember(id, uid));

  // Notify removed member (if not self-removal)
  if (!isSelf) {
    const space = await getTaskById(id);
    fireNotification({
      userId: uid,
      type: "space_member_removed",
      title: "你已被移出空间",
      body: space?.title,
      taskId: id,
      spaceId: id,
      actorId: user.id,
      actorEmail: user.email,
    });
  }

  return rt.empty(204);
}
