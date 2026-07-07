import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, getTaskById, addTaskMember, getTaskMemberRecord } from "@/lib/db";
import { requireOrgMember } from "@/lib/orgs";
import { createRouteTimer } from "@/lib/route-timing";

export const preferredRegion = "hkg1";

// Organization member joins a space within the org (auto-active)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; spaceId: string }> }
) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { id: orgId, spaceId } = await params;

  await rt.track("db_init", async () => initDb());

  // Must be org member
  try {
    await rt.track("db_query", async () => requireOrgMember(orgId, user.id));
  } catch {
    return rt.json({ error: "Not an organization member" }, { status: 403 });
  }

  // Verify space belongs to org
  const space = await rt.track("db_query", async () => getTaskById(spaceId));
  if (!space || !space.pinned) {
    return rt.json({ error: "Space not found" }, { status: 404 });
  }
  if (space.org_id !== orgId) {
    return rt.json({ error: "Space does not belong to this organization" }, { status: 400 });
  }

  // Already a direct member?
  const existing = await rt.track("db_query", async () => getTaskMemberRecord(spaceId, user.id));
  if (existing) {
    return rt.json(
      { space_id: spaceId, status: existing.status },
      { status: existing.status === "active" ? 200 : 202 }
    );
  }

  // Org 成员直接以 active 状态加入空间
  const status = "active";
  await rt.track("db_query", async () =>
    addTaskMember(spaceId, user.id, user.email, "member", status)
  );

  return rt.json({ space_id: spaceId, status }, { status: 201 });
}
