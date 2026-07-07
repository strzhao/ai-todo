import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, getUserNickname, setUserNickname } from "@/lib/db";
import { createRouteTimer } from "@/lib/route-timing";

export const preferredRegion = "hkg1";

export async function GET(req: NextRequest) {
  const rt = createRouteTimer(req);
  const user = await getUserFromRequest(req);
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  await rt.track("db_init", () => initDb());
  const nickname = await rt.track("query", () => getUserNickname(user.id));

  return rt.json({ email: user.email, nickname });
}

export async function PATCH(req: NextRequest) {
  const rt = createRouteTimer(req);
  const user = await getUserFromRequest(req);
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const raw = typeof body.nickname === "string" ? body.nickname.trim() : null;

  if (raw && raw.length > 20) {
    return rt.json({ error: "昵称不能超过 20 个字符" }, { status: 400 });
  }

  const nickname = raw || null;

  await rt.track("db_init", () => initDb());
  await rt.track("update", () => setUserNickname(user.id, nickname));

  return rt.json({ nickname });
}
