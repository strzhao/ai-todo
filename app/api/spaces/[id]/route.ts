import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getTaskById, getTaskMembers, updatePinnedTask, unpinTask, deleteTask } from "@/lib/db";
import { requireSpaceMember, requireSpaceOwner } from "@/lib/spaces";
import { createRouteTimer } from "@/lib/route-timing";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await rt.track("db_query", async () => requireSpaceMember(id, user.id));
  } catch {
    return rt.json({ error: "Not a space member" }, { status: 403 });
  }

  const [space, members] = await rt.track("db_query", async () =>
    Promise.all([getTaskById(id), getTaskMembers(id)])
  );
  if (!space) return rt.json({ error: "Not found" }, { status: 404 });

  const myMember = members.find((m) => m.user_id === user.id);
  return rt.json({ space: { ...space, name: space.title, my_role: myMember?.role ?? "member" }, members });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await rt.track("db_query", async () => requireSpaceOwner(id, user.id));
  } catch {
    return rt.json({ error: "Only owner can update space" }, { status: 403 });
  }

  const body = await req.json() as { name?: string; description?: string; invite_mode?: string };
  const task = await rt.track("db_query", async () =>
    updatePinnedTask(id, { title: body.name, description: body.description, invite_mode: body.invite_mode })
  );
  if (!task) return rt.json({ error: "Not found" }, { status: 404 });

  return rt.json({ ...task, name: task.title });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await rt.track("db_query", async () => requireSpaceOwner(id, user.id));
  } catch {
    return rt.json({ error: "Only owner can delete space" }, { status: 403 });
  }

  // Unpin first (FK ON DELETE SET NULL clears space_id on child tasks), then delete
  await rt.track("db_query", async () => unpinTask(id));
  await rt.track("db_query", async () => deleteTask(id, user.id));
  return rt.empty(204);
}
