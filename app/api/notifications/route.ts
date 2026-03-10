import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb } from "@/lib/db";
import { getNotifications, markAsRead, markAllAsRead } from "@/lib/notifications";
import { createRouteTimer } from "@/lib/route-timing";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();

  const before = req.nextUrl.searchParams.get("before") ?? undefined;
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 20), 50);

  const notifications = await rt.track("db_query", async () =>
    getNotifications(user.id, { limit, before })
  );
  return rt.json(notifications);
}

export async function PATCH(req: NextRequest) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();

  const body = await req.json() as { ids?: string[]; all?: boolean };

  if (body.all) {
    await rt.track("db_query", async () => markAllAsRead(user.id));
  } else if (body.ids?.length) {
    await rt.track("db_query", async () => markAsRead(user.id, body.ids!));
  } else {
    return rt.json({ error: "ids or all required" }, { status: 400 });
  }

  return rt.json({ ok: true });
}
