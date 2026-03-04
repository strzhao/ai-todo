import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { LLMClient, LLMError } from "@/lib/llm-client";
import type { ParsedTask } from "@/lib/types";

export const preferredRegion = "hkg1";

const SYSTEM_PROMPT = `你是一个任务解析助手。将用户输入的自然语言解析为结构化任务数据，以 JSON 格式输出。

输出格式（严格 JSON，无其他内容）：
{
  "tasks": [
    {
      "title": "任务标题",
      "description": "补充说明（可选，没有则省略）",
      "due_date": "ISO 8601 格式的截止时间（可选，如 2026-03-04T15:00:00+08:00）",
      "priority": 数字（0=紧急/urgent, 1=高/高优先级, 2=普通/默认, 3=低）,
      "tags": ["标签1", "标签2"]（可选，没有则空数组）,
      "assignee": "被指派人邮箱（可选，从 @提及 中提取）",
      "mentions": ["邮箱1", "邮箱2"]（可选，所有 @提及 的邮箱列表）,
      "children": [
        { "title": "子任务标题", "priority": 数字, "due_date": "...", "tags": [] }
      ]（可选，当该任务明显有具体子步骤时使用）
    }
  ]
}

规则：
- 始终返回 tasks 数组，即使只有 1 个任务
- 当用户输入明显包含多个独立并列任务时（顿号/加号/分号/序号列表），自动拆成多个顶级任务
- 当某个任务本身是一个较大的工作包、且包含几个明确的子步骤时，将子步骤放入该任务的 children 数组
- children 中每项字段与普通任务相同（title 必需，其他可选），但 children 不能再嵌套 children
- 最多 2 层：顶级 tasks → 每个 task 的 children（子任务）
- 相对时间（"明天"、"下周五"、"后天"）基于用户提供的 now 字段计算
- 优先级关键词：紧急/urgent/非常重要→0，高/高优先级/重要→1，低/不急→3，其他→2
- 标题应简洁，描述性信息放到 description
- @mention 识别：识别输入中的 @email 模式（如 @alice@company.com 或 @alice），提取为 assignee（第一个）和 mentions（全部）
- 如果提供了 members 列表，优先从列表中匹配成员邮箱
- 没有的字段直接省略，不要用 null`;

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { text, now, members } = await req.json() as {
    text: string;
    now: string;
    members?: Array<{ email: string; display_name?: string }>;
  };

  if (!text?.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const membersContext = members?.length
    ? `\n\n当前空间成员：${members.map((m) => m.display_name ? `${m.display_name}(${m.email})` : m.email).join("、")}`
    : "";

  try {
    const client = new LLMClient();
    const result = await client.chatJson([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `当前时间: ${now}${membersContext}\n\n用户输入: ${text}` },
    ], 0.1);

    const rawTasks = Array.isArray(result.tasks) ? result.tasks : [result];

    function parseItem(item: Record<string, unknown>, fallbackTitle: string): Omit<ParsedTask, "children"> {
      return {
        title: String(item.title || fallbackTitle),
        ...(item.description ? { description: String(item.description) } : {}),
        ...(item.due_date ? { due_date: String(item.due_date) } : {}),
        priority: (typeof item.priority === "number" && [0, 1, 2, 3].includes(item.priority))
          ? item.priority as 0 | 1 | 2 | 3
          : 2,
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        ...(item.assignee ? { assignee: String(item.assignee) } : {}),
        ...(Array.isArray(item.mentions) && item.mentions.length > 0
          ? { mentions: (item.mentions as unknown[]).map(String) }
          : {}),
      };
    }

    const tasks: ParsedTask[] = rawTasks.map((item: Record<string, unknown>, idx: number) => {
      const base = parseItem(item, idx === 0 ? text.slice(0, 100) : `任务 ${idx + 1}`);
      const children = Array.isArray(item.children) && item.children.length > 0
        ? (item.children as Record<string, unknown>[]).map((c, ci) =>
            parseItem(c, `子任务 ${ci + 1}`)
          )
        : undefined;
      return { ...base, ...(children ? { children } : {}) };
    });

    return NextResponse.json({ tasks });
  } catch (err) {
    if (err instanceof LLMError) {
      return NextResponse.json({ error: "AI 解析失败，请手动填写" }, { status: 503 });
    }
    throw err;
  }
}
