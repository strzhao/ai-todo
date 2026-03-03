import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { LLMClient, LLMError } from "@/lib/llm-client";
import type { ParsedTask } from "@/lib/types";

export const preferredRegion = "hkg1";

const SYSTEM_PROMPT = `你是一个任务解析助手。将用户输入的自然语言解析为结构化任务数据，以 JSON 格式输出。

输出格式（严格 JSON，无其他内容）：
{
  "title": "任务标题",
  "description": "补充说明（可选，没有则省略）",
  "due_date": "ISO 8601 格式的截止时间（可选，如 2026-03-04T15:00:00+08:00）",
  "priority": 数字（0=紧急/urgent, 1=高/高优先级, 2=普通/默认, 3=低）,
  "tags": ["标签1", "标签2"]（可选，没有则空数组）
}

规则：
- 相对时间（"明天"、"下周五"、"后天"）基于用户提供的 now 字段计算
- 优先级关键词：紧急/urgent/非常重要→0，高/高优先级/重要→1，低/不急→3，其他→2
- 标题应简洁，描述性信息放到 description
- 没有的字段直接省略，不要用 null`;

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { text, now } = await req.json() as { text: string; now: string };

  if (!text?.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  try {
    const client = new LLMClient();
    const result = await client.chatJson([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `当前时间: ${now}\n\n用户输入: ${text}` },
    ], 0.1);

    const parsed: ParsedTask = {
      title: String(result.title || text.slice(0, 100)),
      ...(result.description ? { description: String(result.description) } : {}),
      ...(result.due_date ? { due_date: String(result.due_date) } : {}),
      priority: (typeof result.priority === "number" && [0, 1, 2, 3].includes(result.priority))
        ? result.priority as 0 | 1 | 2 | 3
        : 2,
      tags: Array.isArray(result.tags) ? result.tags.map(String) : [],
    };

    return NextResponse.json(parsed);
  } catch (err) {
    if (err instanceof LLMError) {
      return NextResponse.json({ error: "AI 解析失败，请手动填写" }, { status: 503 });
    }
    throw err;
  }
}
