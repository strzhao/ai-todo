import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb } from "@/lib/db";
import { getUserNotificationPrefs, setUserNotificationPrefs } from "@/lib/notifications";
import { createRouteTimer } from "@/lib/route-timing";
import type { NotificationPrefs } from "@/lib/types";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();

  const prefs = await rt.track("db_query", async () => getUserNotificationPrefs(user.id));
  return rt.json(prefs);
}

export async function PUT(req: NextRequest) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();

  const prefs = await req.json() as NotificationPrefs;
  await rt.track("db_query", async () => setUserNotificationPrefs(user.id, prefs));
  return rt.json({ ok: true });
}
