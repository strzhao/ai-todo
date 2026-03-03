import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { completeTask, deleteTask, updateTask } from "@/lib/db";
import type { ParsedTask } from "@/lib/types";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { complete?: boolean } & Partial<ParsedTask>;

  if (body.complete) {
    const task = await completeTask(user.id, id);
    return NextResponse.json(task);
  }

  const task = await updateTask(user.id, id, body);
  return NextResponse.json(task);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await deleteTask(user.id, id);
  return new NextResponse(null, { status: 204 });
}
