import type { SpaceMember } from "@/lib/types";

export function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86400000;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

export function formatAxisDate(date: Date): string {
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export function getMemberName(email: string, members: SpaceMember[]): string {
  const m = members.find((mb) => mb.email === email);
  return m?.display_name || email.split("@")[0];
}
