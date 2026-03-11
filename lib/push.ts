// @ts-expect-error web-push has no type declarations
import webpush from "web-push";
import { sql } from "@vercel/postgres";
import { initDb } from "./db";

// Lazy-init VAPID config
let vapidConfigured = false;
function ensureVapid() {
  if (vapidConfigured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys not configured");
  }
  webpush.setVapidDetails("mailto:daniel21436@hotmail.com", publicKey, privateKey);
  vapidConfigured = true;
}

interface PushPayload {
  title: string;
  body?: string;
  url: string;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  await initDb();
  ensureVapid();

  const { rows: subs } = await sql`
    SELECT id, endpoint, p256dh, auth FROM ai_todo_push_subscriptions
    WHERE user_id = ${userId}
  `;

  if (subs.length === 0) return;

  const payloadStr = JSON.stringify({
    title: payload.title,
    body: payload.body || "",
    data: { url: payload.url },
  });

  await Promise.allSettled(
    subs.map((sub) =>
      webpush
        .sendNotification(
          {
            endpoint: sub.endpoint as string,
            keys: { p256dh: sub.p256dh as string, auth: sub.auth as string },
          },
          payloadStr
        )
        .catch(async (err: { statusCode?: number }) => {
          // 410 Gone or 404: subscription expired, clean up
          if (err.statusCode === 410 || err.statusCode === 404) {
            await sql`DELETE FROM ai_todo_push_subscriptions WHERE id = ${sub.id as string}`;
          }
          throw err;
        })
    )
  );
}
