import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getSpacesByUser, createSpace, initDb } from "@/lib/db";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();
  const spaces = await getSpacesByUser(user.id);
  return NextResponse.json(spaces);
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();

  const body = await req.json() as { name?: string; description?: string; invite_mode?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const space = await createSpace(user.id, user.email, {
    name: body.name.trim(),
    description: body.description?.trim() || undefined,
    invite_mode: body.invite_mode === "approval" ? "approval" : "open",
  });

  return NextResponse.json(space, { status: 201 });
}
