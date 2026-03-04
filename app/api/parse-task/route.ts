import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { LLMClient, LLMError } from "@/lib/llm-client";
import { createRouteTimer } from "@/lib/route-timing";
import type { ParsedAction } from "@/lib/types";
import {
  parseActions,
  parseCache,
  cleanupCache,
  getNowMinuteKey,
  CACHE_TTL_MS,
} from "@/lib/parse-utils";

export const preferredRegion = "hkg1";
export const maxDuration = 60;

const SYSTEM_PROMPT = `你是一个 AI 驱动的 Todo 助手。将用户输入的自然语言解析为操作指令，以 JSON 格式输出。

输出格式（严格 JSON，无其他内容）：
{
  "actions": [
    {
      "type": "create",
      "tasks": [
        {
          "title": "任务标题",
          "description": "补充说明（可选）",
          "due_date": "ISO 8601 截止时间（可选）",
          "start_date": "ISO 8601 计划开始时间（可选）",
          "end_date": "ISO 8601 计划结束时间（可选）",
          "priority": 数字（0=紧急, 1=高, 2=普通默认, 3=低）,
          "tags": ["标签"]（可选）,
          "assignee": "被指派人邮箱（可选）",
          "mentions": ["邮箱"]（可选）,
          "children": [{ "title": "子任务", "priority": 数字 }]（可选）
        }
      ]
    },
    {
      "type": "update",
      "target_id": "从 tasks 上下文中匹配的 UUID（优先填写）",
      "target_title": "目标任务标题（用于展示和客户端兜底匹配）",
      "changes": {
        "priority": 数字（可选）,
        "due_date": "ISO 8601（可选）",
        "start_date": "ISO 8601（可选）",
        "end_date": "ISO 8601（可选）",
        "title": "新标题（可选）",
        "description": "新描述（可选）",
        "tags": ["标签"]（可选）
      }
    },
    {
      "type": "complete",
      "target_id": "UUID",
      "target_title": "任务标题"
    },
    {
      "type": "delete",
      "target_id": "UUID",
      "target_title": "任务标题"
    },
    {
      "type": "add_log",
      "target_id": "UUID",
      "target_title": "任务标题",
      "log_content": "进展内容"
    }
  ]
}

规则：
- 始终返回 actions 数组
- 【创建任务】：用户描述新任务时，使用 type=create；一次可创建多个任务（tasks 数组）；支持 children 子任务
- 【更新任务】：用户说"改/更新/修改/推迟/提前/改成"时使用 type=update；从 tasks 上下文中匹配 target_id
- 【完成任务】：用户说"完成/搞定/做好了/done"时使用 type=complete
- 【删除任务】：用户说"删除/取消/移除"时使用 type=delete
- 【添加进展日报】：用户说"加进展/日报/更新进度/记录"时使用 type=add_log；log_content 提取进展内容
- 同一输入可以包含多个 actions（混合操作），如"完成A，新建B"→ complete + create
- tasks 上下文中有匹配任务时，必须填写正确的 target_id UUID；没有上下文时只填 target_title
- 相对时间基于 now 字段计算
- 优先级：紧急/urgent→0，高/重要→1，低/不急→3，其他→2
- @mention：提取 @email 格式，第一个为 assignee，全部为 mentions
- 如有 members 列表，优先从列表匹配邮箱
- 没有的字段直接省略，不要用 null`;


export async function POST(req: NextRequest) {
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  const { text, now, members, tasks: tasksCtx, parent_task } = await req.json() as {
    text: string;
    now: string;
    members?: Array<{ email: string; display_name?: string }>;
    tasks?: Array<{ id: string; title: string; status: number; priority: number }>;
    parent_task?: { id: string; title: string };
  };

  if (!text?.trim()) return rt.json({ error: "text is required" }, { status: 400 });

  const membersContext = members?.length
    ? `\n\n当前空间成员：${members.map((m) => m.display_name ? `${m.display_name}(${m.email})` : m.email).join("、")}`
    : "";

  const tasksContext = tasksCtx?.length
    ? `\n\n当前任务列表（用于匹配操作目标）：\n${tasksCtx.map((t) => `- id:${t.id} 标题:${t.title} 状态:${t.status === 2 ? "已完成" : "待办"} 优先级:P${t.priority}`).join("\n")}`
    : "";

  const parentContext = parent_task
    ? `\n\n当前操作上下文：你正在为父任务「${parent_task.title}」添加子任务，你创建的所有新任务将自动成为该父任务的子任务，请不要在 tasks 数组里再嵌套 children 字段。`
    : "";

  const memberKey = (members ?? []).map((m) => `${m.email}|${m.display_name ?? ""}`).sort().join(",");
  const taskKey = (tasksCtx ?? []).map((t) => t.id).sort().join(",");
  const cacheKey = `${user.id}|${text.trim()}|${getNowMinuteKey(now)}|${memberKey}|${taskKey}|${parent_task?.id ?? ""}`;

  cleanupCache();
  const cached = parseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    rt.add("cache_hit", 1);
    return rt.json({ actions: cached.actions });
  }

  try {
    const client = new LLMClient();
    const result = await rt.track("llm", async () => client.chatJson([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `当前时间: ${now}${membersContext}${tasksContext}${parentContext}\n\n用户输入: ${text}` },
    ], 0.1));

    const actions = parseActions(result, text);

    parseCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, actions });
    return rt.json({ actions });
  } catch (err) {
    if (err instanceof LLMError) {
      const isTimeout = err.message.toLowerCase().includes("timeout");
      return rt.json(
        { error: isTimeout ? "AI 解析超时，请稍后重试" : "AI 解析失败，请手动填写", code: isTimeout ? "timeout" : "upstream_error" },
        { status: 503 }
      );
    }
    throw err;
  }
}
