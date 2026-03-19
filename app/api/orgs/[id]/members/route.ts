import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, getOrgMembers } from "@/lib/db";
import { requireOrgMember } from "@/lib/orgs";
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

  const members = await rt.track("db_query", async () => getOrgMembers(id));
  return rt.json(members);
}
