const BRAND_COLOR = "#3A7D68";
const BG_COLOR = "#F7F6F1";
const TEXT_COLOR = "#1A1A18";
const MUTED_COLOR = "#8F8F8D";

interface NotificationEmailParams {
  title: string;
  body?: string;
  actionUrl: string;
  prefsUrl: string;
}

export function buildNotificationEmailHtml(params: NotificationEmailParams): string {
  const { title, body, actionUrl, prefsUrl } = params;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BG_COLOR};padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#fff;border-radius:12px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background:${BRAND_COLOR};padding:20px 24px;">
          <span style="color:#fff;font-size:14px;font-weight:600;letter-spacing:0.5px;">AI Todo</span>
        </td></tr>
        <!-- Content -->
        <tr><td style="padding:28px 24px;">
          <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:${TEXT_COLOR};line-height:1.4;">${escapeHtml(title)}</p>
          ${body ? `<p style="margin:0 0 20px;font-size:14px;color:${MUTED_COLOR};line-height:1.5;">${escapeHtml(body)}</p>` : ""}
          <a href="${actionUrl}" style="display:inline-block;padding:10px 24px;background:${BRAND_COLOR};color:#fff;font-size:14px;font-weight:500;text-decoration:none;border-radius:6px;">查看详情</a>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 24px;border-top:1px solid #eee;">
          <p style="margin:0;font-size:12px;color:${MUTED_COLOR};">
            <a href="${prefsUrl}" style="color:${MUTED_COLOR};text-decoration:underline;">管理通知偏好</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

interface DigestSection {
  title: string;
  items: string[];
}

interface DigestEmailParams {
  date: string;
  sections: DigestSection[];
  appUrl: string;
  prefsUrl: string;
}

export function buildDigestEmailHtml(params: DigestEmailParams): string {
  const { date, sections, appUrl, prefsUrl } = params;

  const sectionsHtml = sections
    .filter((s) => s.items.length > 0)
    .map((s) => `
      <tr><td style="padding:0 24px 16px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(s.title)}</p>
        <ul style="margin:0;padding:0 0 0 16px;">
          ${s.items.map((item) => `<li style="font-size:14px;color:${TEXT_COLOR};line-height:1.6;margin-bottom:4px;">${escapeHtml(item)}</li>`).join("")}
        </ul>
      </td></tr>
    `)
    .join("");

  if (!sectionsHtml) {
    return buildNotificationEmailHtml({
      title: `每日摘要 · ${date}`,
      body: "今天没有需要关注的事项，继续保持！",
      actionUrl: appUrl,
      prefsUrl,
    });
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BG_COLOR};padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#fff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:${BRAND_COLOR};padding:20px 24px;">
          <span style="color:#fff;font-size:14px;font-weight:600;letter-spacing:0.5px;">AI Todo · 每日摘要</span>
          <span style="color:rgba(255,255,255,0.7);font-size:12px;float:right;line-height:21px;">${escapeHtml(date)}</span>
        </td></tr>
        ${sectionsHtml}
        <tr><td style="padding:16px 24px;">
          <a href="${appUrl}" style="display:inline-block;padding:10px 24px;background:${BRAND_COLOR};color:#fff;font-size:14px;font-weight:500;text-decoration:none;border-radius:6px;">打开 AI Todo</a>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #eee;">
          <p style="margin:0;font-size:12px;color:${MUTED_COLOR};">
            <a href="${prefsUrl}" style="color:${MUTED_COLOR};text-decoration:underline;">管理通知偏好</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
