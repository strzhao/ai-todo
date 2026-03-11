import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getUserFromRequest } from "@/lib/auth";
import { initDb } from "@/lib/db";

export const preferredRegion = "hkg1";

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { endpoint, p256dh, auth, userAgent } = await req.json();
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await initDb();

  // Upsert: delete old subscription for same endpoint, then insert
  await sql`DELETE FROM ai_todo_push_subscriptions WHERE endpoint = ${endpoint}`;
  await sql.query(
    `INSERT INTO ai_todo_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, endpoint, p256dh, auth, userAgent || null]
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { endpoint } = await req.json();
  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  await initDb();
  await sql.query(
    `DELETE FROM ai_todo_push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
    [user.id, endpoint]
  );

  return NextResponse.json({ ok: true });
}
