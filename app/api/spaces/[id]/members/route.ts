import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getSpaceMembers } from "@/lib/db";
import { requireSpaceMember } from "@/lib/spaces";
import { createRouteTimer } from "@/lib/route-timing";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await rt.track("db_query", async () => requireSpaceMember(id, user.id));
  } catch {
    return rt.json({ error: "Not a space member" }, { status: 403 });
  }

  const members = await rt.track("db_query", async () => getSpaceMembers(id));
  return rt.json(members);
}
