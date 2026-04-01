import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import {
  getTaskById,
  getTaskMembers,
  getTaskMemberRecord,
  updatePinnedTask,
  unpinTask,
  deleteTask,
  initDb,
} from "@/lib/db";
import { requireSpaceMember, requireSpaceOwner, getAllSpaceMembers } from "@/lib/spaces";
import { createRouteTimer } from "@/lib/route-timing";
import { sql } from "@vercel/postgres";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await rt.track("db_query", async () => requireSpaceMember(id, user.id));
  } catch {
    // Non-member: return space preview info for join guidance UI
    const [previewSpace, previewMembers, memberRecord] = await rt.track("db_preview", async () =>
      Promise.all([getTaskById(id), getTaskMembers(id), getTaskMemberRecord(id, user.id)])
    );
    if (!previewSpace) return rt.json({ error: "Not found" }, { status: 404 });
    const activeCount = previewMembers.filter((m) => m.status === "active").length;
    return rt.json(
      {
        error: "Not a space member",
        space_preview: {
          title: previewSpace.title,
          invite_mode: previewSpace.invite_mode ?? "open",
          invite_code: previewSpace.invite_code ?? "",
          member_count: activeCount,
        },
        pending: memberRecord?.status === "pending",
      },
      { status: 403 }
    );
  }

  const [space, members] = await rt.track("db_query", async () =>
    Promise.all([getTaskById(id), getAllSpaceMembers(id)])
  );
  if (!space) return rt.json({ error: "Not found" }, { status: 404 });

  const myMember = members.find((m) => m.user_id === user.id);
  return rt.json({
    space: {
      ...space,
      name: space.title,
      my_role: myMember?.role ?? "member",
      my_user_id: user.id,
    },
    members,
  });
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

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    invite_mode?: string;
    org_id?: string | null;
  };
  const task = await rt.track("db_query", async () =>
    updatePinnedTask(id, {
      title: body.name,
      description: body.description,
      invite_mode: body.invite_mode,
    })
  );
  if (!task) return rt.json({ error: "Not found" }, { status: 404 });

  // Update org_id if provided
  if (body.org_id !== undefined) {
    await rt.track("db_init", async () => initDb());
    await rt.track("db_query", async () =>
      sql.query(`UPDATE ai_todo_tasks SET org_id = $1 WHERE id = $2`, [body.org_id, id])
    );
  }

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
