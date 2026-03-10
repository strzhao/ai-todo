import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getTaskByInviteCode, addTaskMember, getTaskMemberRecord, getTaskMembers } from "@/lib/db";
import { createRouteTimer } from "@/lib/route-timing";
import { fireNotification } from "@/lib/notifications";

export const preferredRegion = "hkg1";

// Public: preview pinned task info via invite code (no auth required)
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const rt = createRouteTimer(req);
  const { code } = await params;

  const task = await rt.track("db_query", async () => getTaskByInviteCode(code));
  if (!task) return rt.json({ error: "Invite link not found" }, { status: 404 });

  return rt.json({
    id: task.id,
    name: task.title,
    owner_email: task.user_id, // user_id here; owner_email not stored on tasks
    member_count: task.member_count ?? 0,
    invite_mode: task.invite_mode ?? "open",
  });
}

// Authenticated: join pinned task via invite code
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { code } = await params;

  const task = await rt.track("db_query", async () => getTaskByInviteCode(code));
  if (!task) return rt.json({ error: "Invite link not found" }, { status: 404 });

  const existing = await rt.track("db_query", async () => getTaskMemberRecord(task.id, user.id));
  if (existing) {
    return rt.json(
      { space_id: task.id, status: existing.status },
      { status: existing.status === "active" ? 200 : 202 }
    );
  }

  const status = task.invite_mode === "approval" ? "pending" : "active";
  await rt.track("db_query", async () => addTaskMember(task.id, user.id, user.email, "member", status));

  // Notify space owner if approval needed
  if (status === "pending") {
    const members = await rt.track("db_query", async () => getTaskMembers(task.id));
    const owner = members.find(m => m.role === "owner");
    if (owner && owner.user_id !== user.id) {
      fireNotification({
        userId: owner.user_id,
        type: "space_join_pending",
        title: `${user.email.split("@")[0]} 申请加入空间`,
        body: task.title,
        taskId: task.id,
        spaceId: task.id,
        actorId: user.id,
        actorEmail: user.email,
      });
    }
  }

  return rt.json({ space_id: task.id, status }, { status: 201 });
}
