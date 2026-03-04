import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getSpaceByInviteCode, addSpaceMember, getSpaceMemberRecord } from "@/lib/db";
import { createRouteTimer } from "@/lib/route-timing";

export const preferredRegion = "hkg1";

// Public: preview space info via invite code (no auth required)
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const rt = createRouteTimer(req);
  const { code } = await params;

  const space = await rt.track("db_query", async () => getSpaceByInviteCode(code));
  if (!space) return rt.json({ error: "Invite link not found" }, { status: 404 });

  return rt.json({
    id: space.id,
    name: space.name,
    owner_email: space.owner_email,
    member_count: space.member_count ?? 0,
    invite_mode: space.invite_mode,
  });
}

// Authenticated: join space via invite code
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { code } = await params;

  const space = await rt.track("db_query", async () => getSpaceByInviteCode(code));
  if (!space) return rt.json({ error: "Invite link not found" }, { status: 404 });

  // Check if already a member
  const existing = await rt.track("db_query", async () => getSpaceMemberRecord(space.id, user.id));
  if (existing) {
    return rt.json(
      { space_id: space.id, status: existing.status },
      { status: existing.status === "active" ? 200 : 202 }
    );
  }

  const status = space.invite_mode === "approval" ? "pending" : "active";
  await rt.track("db_query", async () => addSpaceMember(space.id, user.id, user.email, "member", status));

  return rt.json({ space_id: space.id, status }, { status: 201 });
}
