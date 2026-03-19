import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, getOrgById, getOrgMembers, updateOrg, deleteOrg } from "@/lib/db";
import { requireOrgMember, requireOrgOwner } from "@/lib/orgs";
import { createRouteTimer } from "@/lib/route-timing";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  await rt.track("db_init", async () => initDb());

  try {
    await rt.track("db_query", async () => requireOrgMember(id, user.id));
  } catch {
    return rt.json({ error: "Not an organization member" }, { status: 403 });
  }

  const [org, members] = await rt.track("db_query", async () =>
    Promise.all([getOrgById(id), getOrgMembers(id)])
  );
  if (!org) return rt.json({ error: "Not found" }, { status: 404 });

  const myMember = members.find((m) => m.user_id === user.id);
  return rt.json({
    org: { ...org, my_role: myMember?.role ?? "member", my_user_id: user.id },
    members,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  await rt.track("db_init", async () => initDb());

  try {
    await rt.track("db_query", async () => requireOrgOwner(id, user.id));
  } catch {
    return rt.json({ error: "Only owner can update organization" }, { status: 403 });
  }

  const body = await req.json() as { name?: string; description?: string };
  const org = await rt.track("db_query", async () =>
    updateOrg(id, { name: body.name, description: body.description })
  );
  if (!org) return rt.json({ error: "Not found" }, { status: 404 });

  return rt.json(org);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  await rt.track("db_init", async () => initDb());

  try {
    await rt.track("db_query", async () => requireOrgOwner(id, user.id));
  } catch {
    return rt.json({ error: "Only owner can dissolve organization" }, { status: 403 });
  }

  await rt.track("db_query", async () => deleteOrg(id));
  return rt.empty(204);
}
