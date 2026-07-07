import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

/**
 * 解析笔记 API 的当前用户 ID。
 *
 * Phase 1:仅 session_token(Bearer)/ 浏览器 cookie,复用 getUserFromRequest。
 * Phase 2:扩展 ait_ space token / space 成员分支(多人共享笔记)。
 */
export async function resolveNoteUserId(req: NextRequest): Promise<string | null> {
  const user = await getUserFromRequest(req);
  return user?.id ?? null;
}
