import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getSpaceById, getSpaceMembers, updateSpace, deleteSpace, initDb } from "@/lib/db";
import { requireSpaceMember, requireSpaceOwner } from "@/lib/spaces";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();
  const { id } = await params;

  try {
    await requireSpaceMember(id, user.id);
  } catch {
    return NextResponse.json({ error: "Not a space member" }, { status: 403 });
  }

  const [space, members] = await Promise.all([getSpaceById(id), getSpaceMembers(id)]);
  if (!space) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ space, members });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();
  const { id } = await params;

  try {
    await requireSpaceOwner(id, user.id);
  } catch {
    return NextResponse.json({ error: "Only owner can update space" }, { status: 403 });
  }

  const body = await req.json() as { name?: string; description?: string; invite_mode?: string };
  const space = await updateSpace(id, body);
  if (!space) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(space);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();
  const { id } = await params;

  try {
    await requireSpaceOwner(id, user.id);
  } catch {
    return NextResponse.json({ error: "Only owner can delete space" }, { status: 403 });
  }

  await deleteSpace(id);
  return new NextResponse(null, { status: 204 });
}
