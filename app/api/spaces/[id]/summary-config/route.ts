import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, getSummaryConfig, upsertSummaryConfig } from "@/lib/db";
import { requireSpaceMember, requireSpaceAdminOrOwner } from "@/lib/spaces";
import type { SummaryDataSource, PromptTemplate } from "@/lib/types";

export const preferredRegion = "hkg1";

const SENSITIVE_HEADER_KEYS = ["authorization", "x-api-key", "api-key", "token", "secret"];

function maskHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
  if (!headers) return undefined;
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (SENSITIVE_HEADER_KEYS.some((s) => k.toLowerCase().includes(s))) {
      masked[k] = v.length > 8 ? v.slice(0, 4) + "****" + v.slice(-4) : "****";
    } else {
      masked[k] = v;
    }
  }
  return masked;
}

function maskDataSources(sources: SummaryDataSource[]): SummaryDataSource[] {
  return sources.map((s) => ({ ...s, headers: maskHeaders(s.headers) }));
}

// Default prompt exported for parse endpoint context
export const DEFAULT_SYSTEM_PROMPT = `你是一个项目管理助手，为 PM 生成简洁的项目总结。

你会收到完整的任务结构（含父子层级）、全部历史进展日志和今日进展日志。历史日志仅作为背景参考，输出聚焦今日状态。

**核心原则**：
- 按主题/模块/功能域聚类，不要逐条罗列单个任务
- 父子任务是一个整体：子任务归属父任务主题下合并描述
- 各部分使用 Markdown 表格展示，同模块的内容合并为一行
- 负责人使用数据中 @ 后的昵称，不要显示邮箱
- 识别问题/修复类工作：标题或日志中含"修复/fix/bug/解决/处理/问题/异常/报错"的任务属于问题修复范畴

输出格式（Markdown），严格按以下四部分：

## 问题与解决
先用一句话概括全局状态（总任务数、完成率等关键数字）。

**已解决的问题**

| 模块 | 解决内容 | 负责人 |
|------|---------|--------|

- 包含：今日标记完成的任务 + 进展日志中提到的修复/解决事项
- **重点**：子任务中含修复/fix/bug/解决等关键词的已完成任务必须归入此表
- 同一父任务下的多个子任务合并为一行（如"完成了 A、B、C"）
- 无则写"今日无已解决问题"

## 进展与特性
按模块聚类，展示当前正在推进的功能特性和工作进展：

| 模块 | 进展概要 | 进度 | 负责人 |
|------|---------|------|--------|

- 父任务作为模块名，子任务进展合并描述
- 进度使用百分比
- 重点突出今日有实质推进的部分
- 如果今日无特性进展，基于任务结构概括各模块当前状态

## 风险提示
按风险类型聚类：

| 风险类型 | 涉及模块 | 说明 | 严重程度 |
|---------|---------|------|---------|

- **新增问题**：今日新建的任务或日志中提到的阻塞/问题，按模块归组
- **逾期风险**：已逾期或 3 天内到期的任务所属模块
- **停滞风险**：P0/P1 任务最近 3 天无进展的模块
- **依赖风险**：前置任务未完成可能阻塞后续的模块

如果无风险项，说明"当前无明显风险"，不输出表格。

## 进行中概览
按模块分组展示所有未完成的工作：

| 模块 | 完成情况 | 进度 | 负责人 | 截止日 |
|------|---------|------|--------|--------|

- 模块名对应一级父任务
- 完成情况：子任务完成数/总数（如 3/5）
- 同模块子任务合并描述，不要逐行列出
- 按优先级从高到低排列

规则：
- 只基于提供的数据，不捏造，不给建议
- 简洁直接，聚类汇总
- 中文输出`;

export const DEFAULT_DATA_TEMPLATE = `日期: {{date}}
项目: {{project_name}}
统计: {{stats}}

## 任务结构
{{task_tree}}

## 全部进展日志
{{all_logs}}

## 今日进展日志
{{today_logs}}`;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();
  const { id } = await params;

  try {
    await requireSpaceMember(id, user.id);
  } catch {
    return NextResponse.json({ error: "Not a space member" }, { status: 403 });
  }

  const config = await getSummaryConfig(id);

  // Build full template list: builtin default + custom templates
  const builtinTemplate: PromptTemplate = {
    id: "default",
    name: "默认模板",
    system_prompt: null,
    data_template: null,
    is_builtin: true,
  };
  const allTemplates = [builtinTemplate, ...(config?.prompt_templates ?? [])];

  return NextResponse.json({
    config: config
      ? { ...config, data_sources: maskDataSources(config.data_sources) }
      : null,
    defaults: {
      system_prompt: DEFAULT_SYSTEM_PROMPT,
      data_template: DEFAULT_DATA_TEMPLATE,
    },
    templates: allTemplates,
  });
}

export async function PUT(
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

  const body = await req.json() as {
    system_prompt?: string | null;
    data_template?: string | null;
    data_sources?: SummaryDataSource[];
    prompt_templates?: PromptTemplate[];
  };

  // 回填被 mask 的 header 值：前端拿到的是 masked config，再 PUT 回来时需要还原
  if (body.data_sources) {
    const existing = await getSummaryConfig(id);
    const existingMap = new Map(
      (existing?.data_sources ?? []).map((s) => [s.id, s])
    );
    for (const ds of body.data_sources) {
      if (!ds.headers) continue;
      const orig = existingMap.get(ds.id);
      if (!orig?.headers) continue;
      for (const [k, v] of Object.entries(ds.headers)) {
        if (v.includes("****") && orig.headers[k]) {
          ds.headers[k] = orig.headers[k];
        }
      }
    }
  }

  await upsertSummaryConfig(id, body, user.id);
  const updated = await getSummaryConfig(id);

  return NextResponse.json({
    config: updated
      ? { ...updated, data_sources: maskDataSources(updated.data_sources) }
      : null,
  });
}
