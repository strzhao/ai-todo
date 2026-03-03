import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getSpaceByInviteCode, addSpaceMember, getSpaceMemberRecord, initDb } from "@/lib/db";

export const preferredRegion = "hkg1";

// Public: preview space info via invite code (no auth required)
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  await initDb();
  const { code } = await params;

  const space = await getSpaceByInviteCode(code);
  if (!space) return NextResponse.json({ error: "Invite link not found" }, { status: 404 });

  return NextResponse.json({
    id: space.id,
    name: space.name,
    owner_email: space.owner_email,
    member_count: space.member_count ?? 0,
    invite_mode: space.invite_mode,
  });
}

// Authenticated: join space via invite code
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();
  const { code } = await params;

  const space = await getSpaceByInviteCode(code);
  if (!space) return NextResponse.json({ error: "Invite link not found" }, { status: 404 });

  // Check if already a member
  const existing = await getSpaceMemberRecord(space.id, user.id);
  if (existing) {
    return NextResponse.json(
      { space_id: space.id, status: existing.status },
      { status: existing.status === "active" ? 200 : 202 }
    );
  }

  const status = space.invite_mode === "approval" ? "pending" : "active";
  await addSpaceMember(space.id, user.id, user.email, "member", status);

  return NextResponse.json({ space_id: space.id, status }, { status: 201 });
}
