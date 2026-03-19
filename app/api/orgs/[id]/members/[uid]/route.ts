import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, updateOrgMember, removeOrgMember, getOrgMemberRecord, getOrgById } from "@/lib/db";
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

  await rt.track("db_init", async () => initDb());

  const body = await req.json() as { status?: string; role?: string };

  // Permission check
  const actor = await rt.track("db_query", async () => getOrgMemberRecord(id, user.id));
  if (!actor || (actor.role !== "owner" && actor.role !== "admin")) {
    return rt.json({ error: "Insufficient permissions" }, { status: 403 });
  }
  // Only owner can change roles
  if (body.role !== undefined && actor.role !== "owner") {
    return rt.json({ error: "Only owner can change roles" }, { status: 403 });
  }
  // Admin cannot manage owner or other admins
  if (actor.role === "admin") {
    const target = await rt.track("db_query", async () => getOrgMemberRecord(id, uid));
    if (target && target.role !== "member") {
      return rt.json({ error: "Admin can only manage regular members" }, { status: 403 });
    }
  }

  const memberBefore = await rt.track("db_query", async () => getOrgMemberRecord(id, uid));
  const member = await rt.track("db_query", async () => updateOrgMember(id, uid, body));
  if (!member) return rt.json({ error: "Not found" }, { status: 404 });

  // Notify member when approved (pending -> active)
  if (memberBefore?.status === "pending" && body.status === "active" && uid !== user.id) {
    const org = await getOrgById(id);
    fireNotification({
      userId: uid,
      type: "org_member_approved",
      title: "你的加入申请已通过",
      body: org?.name,
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

  await rt.track("db_init", async () => initDb());

  const isSelf = uid === user.id;

  if (!isSelf) {
    const actor = await rt.track("db_query", async () => getOrgMemberRecord(id, user.id));
    if (!actor || (actor.role !== "owner" && actor.role !== "admin")) {
      return rt.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    const target = await rt.track("db_query", async () => getOrgMemberRecord(id, uid));
    if (target?.role === "owner") {
      return rt.json({ error: "Cannot remove the organization owner" }, { status: 400 });
    }
    if (actor.role === "admin" && target?.role === "admin") {
      return rt.json({ error: "Admin cannot remove other admins" }, { status: 403 });
    }
  } else {
    // Self-removal: owner cannot leave
    const self = await rt.track("db_query", async () => getOrgMemberRecord(id, uid));
    if (self?.role === "owner") {
      return rt.json({ error: "Owner cannot leave the organization" }, { status: 400 });
    }
  }

  await rt.track("db_query", async () => removeOrgMember(id, uid));

  // Notify removed member (if not self-removal)
  if (!isSelf) {
    const org = await getOrgById(id);
    fireNotification({
      userId: uid,
      type: "org_member_removed",
      title: "你已被移出组织",
      body: org?.name,
      actorId: user.id,
      actorEmail: user.email,
    });
  }

  return rt.empty(204);
}
