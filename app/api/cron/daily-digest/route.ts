import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";
import { getUserNotificationPrefs } from "@/lib/notifications";
import {
  getUserDigestData,
  hasDigestContent,
  buildDigestSections,
  buildDailyDigestNotification,
} from "@/lib/daily-digest";
import { buildDigestEmailHtml } from "@/lib/email-templates";
import { sendDigestEmail } from "@/lib/email";
import { sendPushToUser } from "@/lib/push";

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
      const prefs = await getUserNotificationPrefs(userId);
      const digestPref = prefs.daily_digest;
      const shouldSendInapp = !!digestPref?.inapp;
      const shouldSendEmail = !!digestPref?.email;
      const shouldSendPush = !!digestPref?.push;

      if (!shouldSendInapp && !shouldSendEmail && !shouldSendPush) {
        skipped++;
        continue;
      }

      // Channel-aware dedupe, with legacy notification fallback for older records.
      const { rows: existing } = await sql.query(
        `SELECT 1
           FROM ai_todo_digest_delivery
          WHERE user_id = $1 AND digest_date = $2::DATE
         UNION ALL
         SELECT 1
           FROM ai_todo_notifications
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

      const digestNotification = buildDailyDigestNotification(data, today);
      const deliveries: Array<Promise<unknown>> = [];

      if (shouldSendEmail) {
        const sections = buildDigestSections(data);
        const html = buildDigestEmailHtml({
          date: today,
          sections,
          appUrl: APP_URL,
          prefsUrl: `${APP_URL}/account`,
        });
        deliveries.push(
          sendDigestEmail({
            to: email,
            subject: digestNotification.title,
            html,
          })
        );
      }

      if (shouldSendPush) {
        deliveries.push(
          sendPushToUser(userId, {
            title: digestNotification.title,
            body: digestNotification.body,
            url: "/notifications",
          })
        );
      }

      await Promise.all(deliveries);

      let notificationId: string | null = null;
      if (shouldSendInapp) {
        const { rows } = await sql.query(
          `INSERT INTO ai_todo_notifications (user_id, type, title, body, data)
           VALUES ($1, 'daily_digest', $2, $3, $4)
           RETURNING id`,
          [
            userId,
            digestNotification.title,
            digestNotification.body,
            JSON.stringify(digestNotification.data),
          ]
        );
        notificationId = (rows[0]?.id as string) ?? null;
      }

      await sql.query(
        `INSERT INTO ai_todo_digest_delivery (user_id, digest_date, channels, notification_id)
         VALUES ($1, $2::DATE, $3, $4)
         ON CONFLICT (user_id, digest_date) DO NOTHING`,
        [
          userId,
          today,
          JSON.stringify({
            inapp: shouldSendInapp,
            email: shouldSendEmail,
            push: shouldSendPush,
          }),
          notificationId,
        ]
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
