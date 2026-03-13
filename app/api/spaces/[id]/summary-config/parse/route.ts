import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, getSummaryConfig } from "@/lib/db";
import { requireSpaceAdminOrOwner } from "@/lib/spaces";
import { LLMClient, LLMError } from "@/lib/llm-client";
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_DATA_TEMPLATE } from "../route";
import type { SummaryConfig, ParsedSummaryConfigAction } from "@/lib/types";

export const preferredRegion = "hkg1";
export const maxDuration = 60;

const CONFIG_PARSE_SYSTEM_PROMPT = `你是 AI 总结配置助手。用户通过自然语言描述想要的配置变更，你将其解析为操作指令。

当前配置上下文会提供给你（包括系统 Prompt、数据模板、外部数据源列表）。

输出格式（严格 JSON，无其他内容）：
{
  "actions": [
    {
      "type": "update_prompt",
      "new_prompt": "完整的新系统 prompt 文本",
      "prompt_changes_description": "简要描述做了什么修改"
    },
    {
      "type": "update_template",
      "new_template": "完整的新数据模板文本",
      "template_changes_description": "简要描述做了什么修改"
    },
    {
      "type": "add_datasource",
      "datasource": {
        "name": "数据源名称",
        "method": "GET 或 POST",
        "url": "请求地址（支持 {{date}} {{space_title}} 变量）",
        "headers": {"Header-Name": "value"},
        "body_template": "POST body（可选）",
        "response_extract": "简易点分路径如 data.items（可选）",
        "inject_as": "注入变量名（英文标识符）",
        "timeout_ms": 10000
      }
    },
    {
      "type": "update_datasource",
      "datasource_name": "要修改的数据源名称",
      "datasource": { "url": "新URL", "其他要修改的字段": "..." }
    },
    {
      "type": "remove_datasource",
      "datasource_name": "要删除的数据源名称"
    },
    {
      "type": "toggle_datasource",
      "datasource_name": "要切换的数据源名称",
      "enabled": true
    },
    {
      "type": "add_prompt_template",
      "template": {
        "name": "模板显示名称（如风险分析、周报摘要）",
        "system_prompt": "完整的系统 prompt 文本",
        "data_template": "完整的数据模板文本（可选，null 则使用默认）"
      }
    },
    {
      "type": "update_prompt_template",
      "template_name": "要修改的模板名称",
      "template": { "system_prompt": "新的完整 prompt 文本" }
    },
    {
      "type": "remove_prompt_template",
      "template_name": "要删除的模板名称"
    }
  ]
}

规则：
- 始终返回 actions 数组
- update_prompt 和 update_template 输出**完整的新文本**，不是 diff
- 用户说"恢复默认"时，对应字段的 new_prompt 或 new_template 值设为 null
- 可用数据模板变量：{{date}}（日期）、{{project_name}}（项目名）、{{task_tree}}（任务树）、{{all_logs}}（全部日志）、{{today_logs}}（今日日志）、{{stats}}（统计摘要）、{{ds.变量名}}（外部数据源结果）
- 添加数据源时 inject_as 自动生成简短英文标识符（snake_case）
- 一次输入可包含多个 actions（如同时修改 prompt 和添加数据源）
- 只返回用户明确要求变更的部分，不要自作主张修改未提及的配置
- 当用户说"添加/新建一个xxx模板"时，使用 add_prompt_template。为新模板生成完整的 system_prompt，针对用户描述的特定场景定制输出格式和内容侧重
- 当用户说"修改/更新xxx模板"时，使用 update_prompt_template
- 当用户说"删除xxx模板"时，使用 remove_prompt_template
- add_prompt_template 的 system_prompt 应该是完整的、独立可用的 prompt，不要引用"默认模板"的内容
- **复合意图识别**（关键）：用户输入可能同时包含多种变更意图，必须全部识别：
  - 当用户描述输出内容应如何变化（如"不要输出原始内容"、"只输出xxx"、"去掉xxx部分"、"直接输出xxx"），这意味着需要 update_prompt 和/或 update_template
  - 当用户提到 URL 并同时描述输出变化时，通常需要同时生成 add_datasource + update_prompt（修改 prompt 让 AI 使用新数据源并按用户要求调整输出）
  - 当用户说"直接输出某数据源内容"时，需要：1) add_datasource 添加数据源 2) update_prompt 修改 prompt 指示 AI 以该数据源内容为主要输出
  - 不要因为识别到 URL 就只生成 add_datasource 而忽略用户对输出行为的要求`;

function buildConfigContext(config: SummaryConfig | null): string {
  const prompt = config?.system_prompt ?? DEFAULT_SYSTEM_PROMPT;
  const template = config?.data_template ?? DEFAULT_DATA_TEMPLATE;
  const sources = config?.data_sources ?? [];

  const isDefaultPrompt = !config?.system_prompt;
  const isDefaultTemplate = !config?.data_template;

  let ctx = `## 当前系统 Prompt（${isDefaultPrompt ? "默认" : "已自定义"}）\n${prompt}\n\n`;
  ctx += `## 当前数据模板（${isDefaultTemplate ? "默认" : "已自定义"}）\n${template}\n\n`;

  if (sources.length > 0) {
    ctx += `## 已配置的外部数据源\n`;
    for (const s of sources) {
      ctx += `- ${s.name}（${s.method} ${s.url}）${s.enabled ? "已启用" : "已禁用"} inject_as=${s.inject_as}\n`;
    }
  } else {
    ctx += `## 外部数据源\n暂无配置\n`;
  }

  const templates = config?.prompt_templates ?? [];
  if (templates.length > 0) {
    ctx += `\n## 已配置的总结模板\n`;
    for (const t of templates) {
      ctx += `- ${t.name}（ID: ${t.id}）\n`;
    }
  }

  ctx += `\n## 可用模板变量\n{{date}}, {{project_name}}, {{task_tree}}, {{all_logs}}, {{today_logs}}, {{stats}}, {{ds.变量名}}`;

  return ctx;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();
  const { id } = await params;

  try {
    await requireSpaceAdminOrOwner(id, user.id);
  } catch {
    return NextResponse.json({ error: "Requires admin or owner role" }, { status: 403 });
  }

  const { text } = await req.json() as { text: string };
  if (!text?.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const config = await getSummaryConfig(id);
  const configContext = buildConfigContext(config);

  try {
    const client = new LLMClient();
    const result = await client.chatJson(
      [
        { role: "system", content: CONFIG_PARSE_SYSTEM_PROMPT },
        { role: "user", content: `${configContext}\n\n用户输入: ${text}` },
      ],
      0.1
    );

    const actions = (result.actions ?? []) as ParsedSummaryConfigAction[];
    return NextResponse.json({ actions });
  } catch (err) {
    if (err instanceof LLMError) {
      const isTimeout = err.message.toLowerCase().includes("timeout");
      return NextResponse.json(
        { error: isTimeout ? "AI 解析超时，请稍后重试" : "AI 解析失败，请重试" },
        { status: 503 }
      );
    }
    throw err;
  }
}
