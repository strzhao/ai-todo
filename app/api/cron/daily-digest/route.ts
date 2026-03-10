import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";
import { getUserNotificationPrefs } from "@/lib/notifications";
import { getUserDigestData, hasDigestContent, buildDigestSections } from "@/lib/daily-digest";
import { buildDigestEmailHtml } from "@/lib/email-templates";
import { sendDigestEmail } from "@/lib/email";

export const preferredRegion = "hkg1";
export const maxDuration = 60;

const APP_URL = process.env.APP_ORIGIN || "https://ai-todo.stringzhao.life";

export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel Cron sends this header)
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initDb();

  const today = new Date().toISOString().slice(0, 10);
  let sent = 0;
  let skipped = 0;

  // Get all activated users
  const { rows: users } = await sql`
    SELECT user_id, email FROM ai_todo_activated_users
  `;

  for (const user of users) {
    const userId = user.user_id as string;
    const email = user.email as string;

    try {
      // Check if user has daily_digest email enabled
      const prefs = await getUserNotificationPrefs(userId);
      if (!prefs.daily_digest?.email) {
        skipped++;
        continue;
      }

      // Check if we already sent today (dedup via notification record)
      const { rows: existing } = await sql.query(
        `SELECT 1 FROM ai_todo_notifications
         WHERE user_id = $1 AND type = 'daily_digest'
           AND created_at >= $2::DATE
           AND created_at < $2::DATE + INTERVAL '1 day'
         LIMIT 1`,
        [userId, today]
      );
      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Build digest content
      const data = await getUserDigestData(userId, today);
      if (!hasDigestContent(data)) {
        skipped++;
        continue;
      }

      const sections = buildDigestSections(data);
      const html = buildDigestEmailHtml({
        date: today,
        sections,
        appUrl: APP_URL,
        prefsUrl: `${APP_URL}/account`,
      });

      // Send email
      await sendDigestEmail({
        to: email,
        subject: `AI Todo 每日摘要 · ${today}`,
        html,
      });

      // Write notification record (dedup + inapp display)
      const summaryBody = sections.map((s) => `${s.title}: ${s.items.length}项`).join("、");
      await sql.query(
        `INSERT INTO ai_todo_notifications (user_id, type, title, body)
         VALUES ($1, 'daily_digest', $2, $3)`,
        [userId, `每日摘要 · ${today}`, summaryBody]
      );

      sent++;
    } catch (err) {
      console.error(`[daily-digest] Failed for user ${userId}:`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    date: today,
    total: users.length,
    sent,
    skipped,
  });
}
