import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { createSpaceApiToken, listSpaceApiTokens, deleteSpaceApiToken, initDb } from "@/lib/db";
import { requireSpaceAdminOrOwner } from "@/lib/spaces";
import { createRouteTimer } from "@/lib/route-timing";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await rt.track("db_query", async () => requireSpaceAdminOrOwner(id, user.id));
  } catch {
    return rt.json({ error: "Requires admin or owner role" }, { status: 403 });
  }

  await rt.track("db_init", async () => initDb());
  const tokens = await rt.track("db_query", async () => listSpaceApiTokens(id));
  return rt.json({ ok: true, tokens });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await rt.track("db_query", async () => requireSpaceAdminOrOwner(id, user.id));
  } catch {
    return rt.json({ error: "Requires admin or owner role" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { label?: string };
  const label = (body.label ?? "").trim();

  await rt.track("db_init", async () => initDb());
  const result = await rt.track("db_query", async () => createSpaceApiToken(id, user.id, label));

  return rt.json(
    {
      ok: true,
      warning: "This token will not be shown again. Copy it now.",
      token: result.token,
      id: result.id,
      prefix: result.prefix,
      label: result.label,
    },
    { status: 201 }
  );
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await rt.track("db_query", async () => requireSpaceAdminOrOwner(id, user.id));
  } catch {
    return rt.json({ error: "Requires admin or owner role" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { token_id?: string };
  if (!body.token_id) return rt.json({ error: "token_id is required" }, { status: 400 });

  await rt.track("db_init", async () => initDb());
  await rt.track("db_query", async () => deleteSpaceApiToken(body.token_id!, id));
  return rt.json({ ok: true });
}
