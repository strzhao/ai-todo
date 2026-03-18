import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { LLMClient, LLMError } from "@/lib/llm-client";
import { aiFlowLog, getAiTraceIdFromHeaders, summarizeParsedActions } from "@/lib/ai-flow-log";
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
          "type": 数字（0=任务默认, 1=笔记）,
          "tags": ["标签"]（可选）,
          "assignee": "被指派人邮箱（可选）",
          "mentions": ["邮箱"]（可选）,
          "parent_target_id": "已存在父任务 UUID（可选，优先）",
          "parent_target_title": "已存在父任务标题（可选，兜底）",
          "children": [
            {
              "title": "子任务标题",
              "description": "说明（可选）",
              "due_date": "ISO 8601（可选）",
              "start_date": "ISO 8601（可选）",
              "end_date": "ISO 8601（可选）",
              "priority": 数字,
              "tags": ["标签"]（可选）,
              "assignee": "邮箱（可选）"
            }
          ]（可选，仅 1 级嵌套）
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
        "tags": ["标签"]（可选）,
        "assignee_email": "新经办人邮箱（可选，可为 null 表示取消经办人）",
        "progress": 数字 0-100（可选，用户说"进度50%/完成度80%"时设置）,
        "type": 数字（可选，0=任务 1=笔记，用于笔记与任务互转）
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
    },
    {
      "type": "move",
      "target_id": "被移动任务的 UUID",
      "target_title": "被移动任务标题",
      "to_parent_id": "目标父任务 UUID（优先填写）",
      "to_parent_title": "目标父任务标题"
    },
    {
      "type": "reopen",
      "target_id": "UUID",
      "target_title": "任务标题"
    }
  ]
}

规则：
- 始终返回 actions 数组
- 【创建任务】：用户描述新任务时，使用 type=create；一次可创建多个任务（tasks 数组）
- 【层级创建】：当用户描述的任务之间存在明确的父子/包含关系时（如"创建X项目，包含A/B/C"、"做一个X，分成几步：1.A 2.B 3.C"、"X下面有几个事项"），应使用 children 数组将子任务嵌套在父任务中，而不是创建多个独立任务
- 【独立创建】：当用户列举的是互不相关的独立任务时（如"创建任务A，还有任务B"），才在 tasks 数组中创建多个平级任务
- 【更新任务】：用户说"改/更新/修改/推迟/提前/改成/转派/经办人改为"时使用 type=update；从 tasks 上下文中匹配 target_id
- 【完成任务】：用户说"完成/搞定/做好了/done"时使用 type=complete
- 【删除任务】：用户说"删除/取消/移除"时使用 type=delete
- 【添加进展日报】：用户说"加进展/日报/更新进度/记录"时使用 type=add_log；log_content 提取进展内容
- 【更新进度百分比】：用户说"进度50%/完成度80%/进展到60%"时使用 type=update 且 changes.progress = 对应数字（0-100）
- 【移动为子任务】：用户说"移动/挪到/放到...下面/作为子任务"时使用 type=move
- 【重新打开任务】：用户说"重新打开/恢复/取消完成/reopen/没完成"时使用 type=reopen；从 tasks 上下文中匹配 target_id（通常目标为已完成任务）
- 【新建到已有父任务下】：用户说"在A下创建B/把B作为A子任务创建"时，仍用 type=create，并在对应 task 上填写 parent_target_id（优先）或 parent_target_title
- 【取消经办人】：用户说"取消经办人/不再指派/无人负责"时，输出 type=update 且 changes.assignee_email = null
- 【笔记】：用户说"记一下/笔记/想法/memo/备忘"或表达纯感想、记录、灵感时，使用 type=create 且 tasks 中设 type=1。笔记不需要 due_date/start_date/end_date/priority，只需 title 和可选 tags
- 【笔记转任务】：当用户给已有笔记（type=1 的记录）添加截止日期、优先级、指派人时，自动在 changes 中同时设 type=0，将笔记升级为任务
- 同一输入可以包含多个 actions（混合操作），如"完成A，新建B"→ complete + create
- 批量移动时为每个源任务输出一个 move action（例如"把A、B移到C下面"→ 两个 move）
- tasks 上下文中有匹配任务时，必须填写正确的 target_id UUID；没有上下文时只填 target_title
- move 的目标父任务同理：能匹配就填写 to_parent_id；否则填写 to_parent_title
- 相对时间基于 now 字段计算，now 为 UTC 时间（ISO 8601 带 Z 后缀），需结合用户时区转换为当地时间后再理解"今天/明天/晚上/上午"等相对表达
- 输出的日期时间统一用 ISO 8601 格式，带时区偏移（如 2026-03-09T19:30:00+08:00）
- 优先级：紧急/urgent→0，高/重要→1，低/不急→3，其他→2
- @mention：提取 @email 格式，第一个为 assignee，全部为 mentions
- 如有 members 列表，优先从列表匹配邮箱
- 没有的字段直接省略，不要用 null`;


export async function POST(req: NextRequest) {
  const traceId = getAiTraceIdFromHeaders(req.headers);
  const rt = createRouteTimer(req);
  const user = await rt.track("auth", async () => getUserFromRequest(req));
  if (!user) return rt.json({ error: "Unauthorized" }, { status: 401 });

  const { text, now, timezone: tz, members, tasks: tasksCtx, parent_task } = await req.json() as {
    text: string;
    now: string;
    timezone?: string;
    members?: Array<{ email: string; display_name?: string }>;
    tasks?: Array<{ id: string; title: string; status: number; priority: number; description?: string; type?: number }>;
    parent_task?: { id: string; title: string };
  };
  const timezone = tz || "Asia/Shanghai";

  if (!text?.trim()) return rt.json({ error: "text is required" }, { status: 400 });

  aiFlowLog("parse-task.request", {
    trace_id: traceId ?? null,
    text,
    now,
    members_count: members?.length ?? 0,
    tasks_ctx_count: tasksCtx?.length ?? 0,
    tasks_ctx: (tasksCtx ?? []).map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority })),
    parent_task: parent_task ?? null,
  });

  const membersContext = members?.length
    ? `\n\n当前空间成员：${members.map((m) => m.display_name ? `${m.display_name}(${m.email})` : m.email).join("、")}`
    : "";

  const tasksContext = tasksCtx?.length
    ? `\n\n当前任务列表（用于匹配操作目标）：\n${tasksCtx.map((t) => `- id:${t.id} 标题:${t.title}${t.description ? ` 描述:${t.description}` : ""} 状态:${t.status === 2 ? "已完成" : "待办"} 优先级:P${t.priority}${(t.type ?? 0) === 1 ? " 类型:笔记" : ""}`).join("\n")}`
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
    aiFlowLog("parse-task.cache-hit", {
      trace_id: traceId ?? null,
      tasks_ctx_count: tasksCtx?.length ?? 0,
      parent_task_id: parent_task?.id ?? null,
      actions_count: cached.actions.length,
      actions: summarizeParsedActions(cached.actions),
    });
    return rt.json({ actions: cached.actions });
  }

  try {
    const client = new LLMClient();
    const result = await rt.track("llm", async () => client.chatJson([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `当前时间: ${now}（用户时区: ${timezone}，当地时间: ${new Date(now).toLocaleString("zh-CN", { timeZone: timezone, hour12: false })}）${membersContext}${tasksContext}${parentContext}\n\n用户输入: ${text}` },
    ], 0.1));

    const actions = parseActions(result, text);
    aiFlowLog("parse-task.response", {
      trace_id: traceId ?? null,
      actions_count: actions.length,
      actions: summarizeParsedActions(actions),
    });

    parseCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, actions });
    return rt.json({ actions });
  } catch (err) {
    if (err instanceof LLMError) {
      const isTimeout = err.message.toLowerCase().includes("timeout");
      aiFlowLog("parse-task.llm-error", {
        trace_id: traceId ?? null,
        error: err.message,
        timeout: isTimeout,
      });
      return rt.json(
        { error: isTimeout ? "AI 解析超时，请稍后重试" : "AI 解析失败，请手动填写", code: isTimeout ? "timeout" : "upstream_error" },
        { status: 503 }
      );
    }
    aiFlowLog("parse-task.error", {
      trace_id: traceId ?? null,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
