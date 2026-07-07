import { NextRequest } from "next/server";
import { initDb } from "@/lib/db";
import { createRouteTimer } from "@/lib/route-timing";
import { getNotes, createNote } from "@/lib/notes";
import { resolveNoteUserId } from "@/lib/notes-auth";

export const preferredRegion = "hkg1";

const TITLE_MIN = 1;
const TITLE_MAX = 500;

export async function GET(req: NextRequest) {
  const rt = createRouteTimer(req);
  const userId = await rt.track("auth", async () => resolveNoteUserId(req));
  if (!userId) return rt.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();

  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  const tag = req.nextUrl.searchParams.get("tag") ?? undefined;
  const q = req.nextUrl.searchParams.get("q") ?? undefined;

  const result = await rt.track("db_query", async () =>
    getNotes(userId, { cursor, limit, tag, q })
  );
  return rt.json(result);
}

export async function POST(req: NextRequest) {
  const rt = createRouteTimer(req);
  const userId = await rt.track("auth", async () => resolveNoteUserId(req));
  if (!userId) return rt.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();

  let body: { title?: unknown; description?: unknown; tags?: unknown };
  try {
    body = await req.json();
  } catch {
    return rt.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
    return rt.json({ error: `title required (1-${TITLE_MAX} chars after trim)` }, { status: 400 });
  }

  const description = typeof body.description === "string" ? body.description : undefined;
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((t): t is string => typeof t === "string")
    : undefined;

  const note = await rt.track("db_query", async () =>
    createNote(userId, { title, description, tags })
  );
  return rt.json(note, { status: 201 });
}
