import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb } from "@/lib/db";
import { getUnreadCount } from "@/lib/notifications";
import { createRouteTimer } from "@/lib/route-timing";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();

  const count = await rt.track("db_query", async () => getUnreadCount(user.id));
  return rt.json({ count });
}
