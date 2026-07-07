import { NextRequest } from "next/server";
import { initDb } from "@/lib/db";
import { createRouteTimer } from "@/lib/route-timing";
import { getNote, updateNote, deleteNote } from "@/lib/notes";
import { resolveNoteUserId } from "@/lib/notes-auth";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const userId = await rt.track("auth", async () => resolveNoteUserId(req));
  if (!userId) return rt.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();
  const { id } = await params;

  const found = await rt.track("db_query", async () => getNote(id));
  if (!found || found.user_id !== userId) {
    return rt.json({ error: "Not found" }, { status: 404 });
  }
  return rt.json(found.note);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const userId = await rt.track("auth", async () => resolveNoteUserId(req));
  if (!userId) return rt.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();
  const { id } = await params;

  let body: { title?: unknown; description?: unknown; tags?: unknown };
  try {
    body = await req.json();
  } catch {
    return rt.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // 仅接受 {title?, description?, tags?};显式拒绝传 type/due_date/priority 等
  // (db 层不翻 type:门面 PATCH 不含 type 字段)
  const patch: { title?: string; description?: string | null; tags?: string[] } = {};
  if (typeof body.title === "string") patch.title = body.title.trim();
  if (body.description !== undefined) {
    patch.description = typeof body.description === "string" ? body.description : null;
  }
  if (body.tags !== undefined) {
    patch.tags = Array.isArray(body.tags)
      ? body.tags.filter((t): t is string => typeof t === "string")
      : [];
  }

  if (Object.keys(patch).length === 0) {
    return rt.json({ error: "No updatable fields" }, { status: 400 });
  }

  // title 长度校验(若提供)
  if (patch.title !== undefined && (patch.title.length < 1 || patch.title.length > 500)) {
    return rt.json({ error: "title must be 1-500 chars" }, { status: 400 });
  }

  const updated = await rt.track("db_query", async () => updateNote(id, userId, patch));
  if (!updated) {
    return rt.json({ error: "Not found" }, { status: 404 });
  }
  return rt.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const userId = await rt.track("auth", async () => resolveNoteUserId(req));
  if (!userId) return rt.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();
  const { id } = await params;

  const ok = await rt.track("db_query", async () => deleteNote(id, userId));
  if (!ok) return rt.json({ error: "Not found" }, { status: 404 });
  return rt.json({ ok: true });
}
