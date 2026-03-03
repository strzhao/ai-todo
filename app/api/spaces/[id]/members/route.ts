import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getSpaceMembers, initDb } from "@/lib/db";
import { requireSpaceMember } from "@/lib/spaces";

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

  const members = await getSpaceMembers(id);
  return NextResponse.json(members);
}
