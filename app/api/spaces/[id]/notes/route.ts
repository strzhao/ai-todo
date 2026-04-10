import { NextRequest } from "next/server";
import { getUserFromRequest, getSpaceFromApiToken } from "@/lib/auth";
import { createTask, initDb } from "@/lib/db";
import { requireSpaceMember } from "@/lib/spaces";
import { createRouteTimer } from "@/lib/route-timing";

export const preferredRegion = "hkg1";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const { id } = await params;

  let userId: string;

  // Path 1: Space API token auth
  const spaceAuth = await rt.track("auth", async () => getSpaceFromApiToken(req));
  if (spaceAuth) {
    if (spaceAuth.spaceId !== id) {
      return rt.json({ error: "Token does not belong to this space" }, { status: 403 });
    }
    userId = `space-api:${spaceAuth.tokenId}`;
  } else {
    // Path 2: User auth
    const user = await rt.track("auth_user", async () => getUserFromRequest(req));
    if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

    try {
      await rt.track("db_query", async () => requireSpaceMember(id, user.id));
    } catch {
      return rt.json({ error: "Not a space member" }, { status: 403 });
    }

    userId = user.id;
  }

  const body = (await req.json().catch(() => ({}))) as { title?: string; tags?: string[] };
  if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
    return rt.json({ error: "title is required" }, { status: 400 });
  }

  await rt.track("db_init", async () => initDb());
  const note = await rt.track("db_query", async () =>
    createTask(userId, {
      title: body.title!.trim(),
      tags: Array.isArray(body.tags) ? body.tags : [],
      spaceId: id,
      type: 1,
    })
  );

  return rt.json(
    {
      ok: true,
      note: {
        id: note.id,
        title: note.title,
        tags: note.tags,
        created_at: note.created_at,
      },
    },
    { status: 201 }
  );
}
