import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { LLMClient } from "@/lib/llm-client";

export const preferredRegion = "hkg1";
export const maxDuration = 30;

const SYSTEM_PROMPT = `你是一个笔记整理助手。用户通过语音输入了一段话，请将其整理为简洁的笔记。

要求：
1. title：整理后的笔记标题/内容（简洁、保留核心信息，修复口语化表达和语音识别错误）
2. description：如果原文包含详细内容或多个要点，提取补充说明（可选，没有则不返回）
3. tags：从内容中提取 1-3 个关键词标签（可选）

返回 JSON 格式：
{ "title": "...", "description": "...", "tags": ["...", "..."] }`;

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (text.length > 5000) {
    return NextResponse.json({ error: "text too long (max 5000)" }, { status: 400 });
  }

  try {
    const client = new LLMClient();
    const result = await client.chatJson(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      0.1
    );

    return NextResponse.json({
      title: (result.title as string) || text.slice(0, 200),
      description: (result.description as string) || undefined,
      tags: Array.isArray(result.tags) ? result.tags.filter((t): t is string => typeof t === "string") : [],
    });
  } catch {
    // Degrade: return raw text as title
    return NextResponse.json({
      title: text.slice(0, 200),
      tags: [],
    });
  }
}
