import { sql } from "@vercel/postgres";
import { initDb } from "./db";
import { NOTIFICATION_TYPES, type NotificationType } from "./notification-types";
import type { AppNotification, AppNotificationData, NotificationPrefs } from "./types";
import { getNotificationUrl } from "./notification-utils";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: AppNotificationData;
  taskId?: string;
  spaceId?: string;
  actorId?: string;
  actorEmail?: string;
}

// ─── Preferences ────────────────────────────────────────────────────────────────

function getDefaultPrefs(): NotificationPrefs {
  const prefs: NotificationPrefs = {};
  for (const [key, def] of Object.entries(NOTIFICATION_TYPES)) {
    prefs[key] = { inapp: def.defaultInapp, email: def.defaultEmail, push: def.defaultPush };
  }
  return prefs;
}

export async function getUserNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const { rows } = await sql`
    SELECT prefs FROM ai_todo_notification_prefs WHERE user_id = ${userId} LIMIT 1
  `;
  const defaults = getDefaultPrefs();
  if (!rows[0]) return defaults;
  const stored = rows[0].prefs as NotificationPrefs;
  // Merge: stored overrides defaults, but new types get defaults
  for (const key of Object.keys(defaults)) {
    if (stored[key]) {
      defaults[key] = { ...defaults[key], ...stored[key] };
    }
  }
  return defaults;
}

export async function setUserNotificationPrefs(userId: string, prefs: NotificationPrefs): Promise<void> {
  await sql.query(
    `INSERT INTO ai_todo_notification_prefs (user_id, prefs, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET prefs = $2, updated_at = NOW()`,
    [userId, JSON.stringify(prefs)]
  );
}

export async function shouldNotify(
  userId: string,
  type: NotificationType,
  channel: "inapp" | "email"
): Promise<boolean> {
  const prefs = await getUserNotificationPrefs(userId);
  const pref = prefs[type];
  if (!pref) return false;
  return pref[channel];
}

// ─── Email helpers ──────────────────────────────────────────────────────────────

async function resolveUserEmail(userId: string): Promise<string | null> {
  const { rows } = await sql`
    SELECT email FROM ai_todo_activated_users WHERE user_id = ${userId} LIMIT 1
  `;
  return (rows[0]?.email as string) ?? null;
}

// ─── Row mapping ────────────────────────────────────────────────────────────────

function rowToNotification(row: Record<string, unknown>): AppNotification {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    type: row.type as string,
    title: row.title as string,
    body: (row.body as string) || undefined,
    data: (row.data as AppNotificationData) || undefined,
    task_id: (row.task_id as string) || undefined,
    space_id: (row.space_id as string) || undefined,
    actor_id: (row.actor_id as string) || undefined,
    actor_email: (row.actor_email as string) || undefined,
    read: row.read as boolean,
    created_at: (row.created_at as Date).toISOString(),
  };
}

// ─── CRUD ───────────────────────────────────────────────────────────────────────

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  await initDb();

  const prefs = await getUserNotificationPrefs(params.userId);
  const pref = prefs[params.type];

  // Write inapp notification record
  if (pref?.inapp) {
    await sql.query(
      `INSERT INTO ai_todo_notifications (user_id, type, title, body, data, task_id, space_id, actor_id, actor_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        params.userId,
        params.type,
        params.title,
        params.body ?? null,
        params.data ? JSON.stringify(params.data) : null,
        params.taskId ?? null,
        params.spaceId ?? null,
        params.actorId ?? null,
        params.actorEmail ?? null,
      ]
    );
  }

  // Send email notification (async, non-blocking)
  if (pref?.email) {
    resolveUserEmail(params.userId).then((email) => {
      if (!email) return;
      import("./email").then(({ sendNotificationEmail }) => {
        sendNotificationEmail({
          to: email,
          type: params.type,
          title: params.title,
          body: params.body,
          taskId: params.taskId,
          spaceId: params.spaceId,
          actorEmail: params.actorEmail,
        }).catch((err) => {
          console.error("[email] Failed to send notification email:", err);
        });
      });
    });
  }

  // Send push notification (async, non-blocking)
  if (pref?.push) {
    const url = getNotificationUrl({ task_id: params.taskId, space_id: params.spaceId });
    import("./push").then(({ sendPushToUser }) => {
      sendPushToUser(params.userId, {
        title: params.title,
        body: params.body,
        url,
      }).catch((err) => {
        console.error("[push] Failed to send push notification:", err);
      });
    });
  }
}

export async function createNotifications(paramsList: CreateNotificationParams[]): Promise<void> {
  await Promise.all(paramsList.map(createNotification));
}

export async function getNotifications(
  userId: string,
  opts?: { limit?: number; before?: string }
): Promise<AppNotification[]> {
  const limit = opts?.limit ?? 20;

  if (opts?.before) {
    const { rows } = await sql.query(
      `SELECT * FROM ai_todo_notifications
       WHERE user_id = $1 AND created_at < $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, opts.before, limit]
    );
    return rows.map(rowToNotification);
  }

  const { rows } = await sql.query(
    `SELECT * FROM ai_todo_notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows.map(rowToNotification);
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { rows } = await sql`
    SELECT COUNT(*) as count FROM ai_todo_notifications
    WHERE user_id = ${userId} AND read = FALSE
  `;
  return Number(rows[0].count);
}

export async function markAsRead(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map((_, i) => `$${i + 2}`).join(",");
  await sql.query(
    `UPDATE ai_todo_notifications SET read = TRUE
     WHERE user_id = $1 AND id IN (${placeholders})`,
    [userId, ...ids]
  );
}

export async function markAllAsRead(userId: string): Promise<void> {
  await sql`
    UPDATE ai_todo_notifications SET read = TRUE
    WHERE user_id = ${userId} AND read = FALSE
  `;
}

// ─── Helper: fire notifications for a task event ────────────────────────────────

/** Fire-and-forget notification. Catches errors to avoid blocking callers. */
export function fireNotification(params: CreateNotificationParams): void {
  createNotification(params).catch((err) => {
    console.error("[notification] Failed to create notification:", err);
  });
}

/** Fire-and-forget multiple notifications. */
export function fireNotifications(paramsList: CreateNotificationParams[]): void {
  createNotifications(paramsList).catch((err) => {
    console.error("[notification] Failed to create notifications:", err);
  });
}
