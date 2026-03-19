import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, getOrgByInviteCode, addOrgMember, getOrgMemberRecord, getOrgMembers } from "@/lib/db";
import { createRouteTimer } from "@/lib/route-timing";
import { fireNotification } from "@/lib/notifications";

export const preferredRegion = "hkg1";

// Public: preview org info via invite code (no auth required)
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const rt = createRouteTimer(req);
  const { code } = await params;

  await rt.track("db_init", async () => initDb());

  const org = await rt.track("db_query", async () => getOrgByInviteCode(code));
  if (!org) return rt.json({ error: "Invite link not found" }, { status: 404 });

  return rt.json({
    id: org.id,
    name: org.name,
    description: org.description,
    member_count: org.member_count ?? 0,
  });
}

// Authenticated: join org via invite code
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { code } = await params;

  await rt.track("db_init", async () => initDb());

  const org = await rt.track("db_query", async () => getOrgByInviteCode(code));
  if (!org) return rt.json({ error: "Invite link not found" }, { status: 404 });

  const existing = await rt.track("db_query", async () => getOrgMemberRecord(org.id, user.id));
  if (existing) {
    return rt.json(
      { org_id: org.id, status: existing.status },
      { status: existing.status === "active" ? 200 : 202 }
    );
  }

  // Organizations use direct join (no approval needed)
  await rt.track("db_query", async () => addOrgMember(org.id, user.id, user.email, "member", "active"));

  // Notify org owner
  const members = await rt.track("db_query", async () => getOrgMembers(org.id));
  const owner = members.find(m => m.role === "owner");
  if (owner && owner.user_id !== user.id) {
    fireNotification({
      userId: owner.user_id,
      type: "org_join_pending",
      title: `${user.email.split("@")[0]} 加入了组织`,
      body: org.name,
      actorId: user.id,
      actorEmail: user.email,
    });
  }

  return rt.json({ org_id: org.id, status: "active" }, { status: 201 });
}
