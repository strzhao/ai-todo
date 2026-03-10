import { Resend } from "resend";
import { buildNotificationEmailHtml } from "./email-templates";
import type { NotificationType } from "./notification-types";

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}
const EMAIL_FROM = process.env.EMAIL_FROM || "AI Todo <noreply@stringzhao.life>";
const APP_URL = process.env.APP_ORIGIN || "https://ai-todo.stringzhao.life";

interface SendNotificationEmailParams {
  to: string;
  type: NotificationType;
  title: string;
  body?: string;
  taskId?: string;
  spaceId?: string;
  actorEmail?: string;
}

export async function sendNotificationEmail(params: SendNotificationEmailParams): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set, skipping email");
    return;
  }

  const taskUrl = params.spaceId && params.taskId
    ? `${APP_URL}/spaces/${params.spaceId}?focus=${params.taskId}`
    : params.spaceId
      ? `${APP_URL}/spaces/${params.spaceId}`
      : APP_URL;

  const html = buildNotificationEmailHtml({
    title: params.title,
    body: params.body,
    actionUrl: taskUrl,
    prefsUrl: `${APP_URL}/account`,
  });

  await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: params.title,
    html,
  });
}

export interface SendDigestEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendDigestEmail(params: SendDigestEmailParams): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set, skipping email");
    return;
  }

  await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}
