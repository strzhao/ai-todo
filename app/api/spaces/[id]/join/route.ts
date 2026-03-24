import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getTaskById, addTaskMember, getTaskMemberRecord, getTaskMembers } from "@/lib/db";
import { createRouteTimer } from "@/lib/route-timing";
import { fireNotification } from "@/lib/notifications";

export const preferredRegion = "hkg1";

// Join space by space ID (no invite code needed — used from space page join guide)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const task = await rt.track("db_query", async () => getTaskById(id));
  if (!task || !task.pinned) return rt.json({ error: "Space not found" }, { status: 404 });

  const existing = await rt.track("db_query", async () => getTaskMemberRecord(id, user.id));
  if (existing) {
    return rt.json(
      { space_id: id, status: existing.status },
      { status: existing.status === "active" ? 200 : 202 }
    );
  }

  const status = task.invite_mode === "approval" ? "pending" : "active";
  await rt.track("db_query", async () => addTaskMember(id, user.id, user.email, "member", status));

  if (status === "pending") {
    const members = await rt.track("db_query", async () => getTaskMembers(id));
    const owner = members.find(m => m.role === "owner");
    if (owner && owner.user_id !== user.id) {
      fireNotification({
        userId: owner.user_id,
        type: "space_join_pending",
        title: `${user.email.split("@")[0]} 申请加入空间`,
        body: task.title,
        taskId: id,
        spaceId: id,
        actorId: user.id,
        actorEmail: user.email,
      });
    }
  }

  return rt.json({ space_id: id, status }, { status: 201 });
}
