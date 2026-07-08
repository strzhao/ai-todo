import { NextRequest } from "next/server";
import { initDb, generateShareCode, setShareCode } from "@/lib/db";
import { createRouteTimer } from "@/lib/route-timing";
import { getNote } from "@/lib/notes";
import { resolveNoteUserId } from "@/lib/notes-auth";

export const preferredRegion = "hkg1";

function shareUrl(code: string): string {
  const origin = process.env.APP_ORIGIN ?? "";
  return `${origin}/shared/${code}`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const userId = await rt.track("auth", async () => resolveNoteUserId(req));
  if (!userId) return rt.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();
  const { id } = await params;

  const found = await rt.track("db_query", async () => getNote(id));
  if (!found || found.user_id !== userId) {
    return rt.json({ error: "Not found" }, { status: 404 });
  }

  // 幂等:已有 share_code 则复用
  const existing = found.note.share_code;
  const code = existing ?? generateShareCode();
  if (!existing) {
    await rt.track("db_query", async () => setShareCode(id, code));
  }

  return rt.json({ share_code: code, share_url: shareUrl(code) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const userId = await rt.track("auth", async () => resolveNoteUserId(req));
  if (!userId) return rt.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();
  const { id } = await params;

  const found = await rt.track("db_query", async () => getNote(id));
  if (!found || found.user_id !== userId) {
    return rt.json({ error: "Not found" }, { status: 404 });
  }

  await rt.track("db_query", async () => setShareCode(id, null));
  return rt.json({ ok: true });
}
