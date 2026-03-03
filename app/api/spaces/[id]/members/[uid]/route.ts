import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { updateSpaceMember, removeSpaceMember, getSpaceMemberRecord, initDb } from "@/lib/db";
import { requireSpaceOwner } from "@/lib/spaces";

export const preferredRegion = "hkg1";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; uid: string }> }
) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();
  const { id, uid } = await params;

  const body = await req.json() as { status?: string; display_name?: string; role?: string };

  // Members can only update their own display_name
  const isSelf = uid === user.id;
  const updatingOthers = !isSelf || body.status !== undefined || body.role !== undefined;

  if (updatingOthers) {
    try {
      await requireSpaceOwner(id, user.id);
    } catch {
      return NextResponse.json({ error: "Only owner can update other members" }, { status: 403 });
    }
  }

  const member = await updateSpaceMember(id, uid, body);
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(member);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; uid: string }> }
) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();
  const { id, uid } = await params;

  const isSelf = uid === user.id;

  if (!isSelf) {
    try {
      await requireSpaceOwner(id, user.id);
    } catch {
      return NextResponse.json({ error: "Only owner can remove other members" }, { status: 403 });
    }
  }

  // Prevent removing the last owner
  if (!isSelf) {
    const target = await getSpaceMemberRecord(id, uid);
    if (target?.role === "owner") {
      return NextResponse.json({ error: "Cannot remove the space owner" }, { status: 400 });
    }
  }

  await removeSpaceMember(id, uid);
  return new NextResponse(null, { status: 204 });
}
