/**
 * 日期时间工具函数
 * 统一处理日期格式化、时区转换、默认时间等逻辑
 */

/** 获取本地时区偏移字符串，如 "+08:00" */
function getTimezoneOffset(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const h = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const m = String(Math.abs(offset) % 60).padStart(2, "0");
  return `${sign}${h}:${m}`;
}

/** Date 转 ISO 8601 带本地时区偏移，如 "2026-03-10T14:30:00+08:00" */
export function toLocalISO(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${getTimezoneOffset(date)}`;
}

/** 判断 ISO 字符串是否为纯日期（无时间部分，如 "2026-03-10"） */
export function isDateOnly(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso.trim());
}

/** 判断某个日期是否是"今天" */
export function isToday(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

/** 判断某个日期是否是"明天" */
export function isTomorrow(date: Date): boolean {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return date.getFullYear() === tomorrow.getFullYear()
    && date.getMonth() === tomorrow.getMonth()
    && date.getDate() === tomorrow.getDate();
}

/**
 * 智能格式化日期时间显示
 * - 今天 14:30 / 今天（无时间）
 * - 明天 09:00 / 明天
 * - 3/10 14:30 / 3/10
 */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const dateOnly = isDateOnly(iso);
  const timePart = !dateOnly
    ? ` ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`
    : "";

  if (isToday(d)) return `今天${timePart}`;
  if (isTomorrow(d)) return `明天${timePart}`;

  const datePart = d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  return `${datePart}${timePart}`;
}

/** 格式化为仅日期显示（M/D 格式） */
export function formatDateOnly(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (isToday(d)) return "今天";
  if (isTomorrow(d)) return "明天";
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export type DateField = "due_date" | "start_date" | "end_date";

/** 获取按字段类型的默认时间 */
export function getDefaultTime(field: DateField): { hour: number; minute: number } {
  switch (field) {
    case "due_date": return { hour: 23, minute: 59 };
    case "start_date": return { hour: 9, minute: 0 };
    case "end_date": return { hour: 18, minute: 0 };
  }
}

/** 从 ISO 字符串中提取本地小时和分钟 */
export function extractTime(iso?: string): { hour: number; minute: number } | null {
  if (!iso || isDateOnly(iso)) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { hour: d.getHours(), minute: d.getMinutes() };
}

/** 从 ISO 字符串中提取本地日期的年月日 */
export function extractDate(iso?: string): { year: number; month: number; day: number } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
}

/**
 * 组合日期和时间为 ISO 字符串
 * @param year 年
 * @param month 月（0-based）
 * @param day 日
 * @param hour 时
 * @param minute 分
 */
export function combineDateTimeISO(
  year: number, month: number, day: number,
  hour: number, minute: number,
): string {
  const d = new Date(year, month, day, hour, minute, 0);
  return toLocalISO(d);
}

/** 获取某月的天数 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** 获取某月第一天是周几（0=周日） */
export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}
