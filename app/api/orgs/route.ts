import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, getOrgsForUser, createOrg } from "@/lib/db";
import { createRouteTimer } from "@/lib/route-timing";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  await rt.track("db_init", async () => initDb());
  const orgs = await rt.track("db_query", async () => getOrgsForUser(user.id));
  return rt.json(orgs);
}

export async function POST(req: NextRequest) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  await rt.track("db_init", async () => initDb());

  const body = await req.json() as { name?: string; description?: string };
  if (!body.name?.trim()) {
    return rt.json({ error: "name is required" }, { status: 400 });
  }

  const org = await rt.track("db_query", async () => createOrg(user.id, user.email, {
    name: body.name!.trim(),
    description: body.description?.trim() || undefined,
  }));

  return rt.json(org, { status: 201 });
}
