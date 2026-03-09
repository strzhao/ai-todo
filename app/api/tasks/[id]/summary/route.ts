import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, getTaskForUser, getDescendantTasks, getLogsForTasks } from "@/lib/db";
import { LLMClient } from "@/lib/llm-client";
import type { Task, TaskLog } from "@/lib/types";

export const preferredRegion = "hkg1";
export const maxDuration = 60;

const SUMMARY_SYSTEM_PROMPT = `你是一个项目管理助手，为 PM 生成简洁的项目总结。

你会收到完整的任务结构（含父子层级）、全部历史进展日志和今日进展日志。历史日志仅作为背景参考，输出聚焦今日状态。

**核心原则**：
- 理解任务间的关联，按主题/模块/功能域聚类表达，不要逐条罗列
- 父子任务是一个整体：子任务归属于父任务主题下，不要拆开单独描述
- 用简洁的自然语言段落或分组描述，避免平铺直叙每一条

输出格式（Markdown），严格按以下四部分：

## 问题与解决
先用一句话概括全局状态（总任务数、完成率等关键数字）。

然后分两块输出：

**已解决的问题**：基于今日完成的任务和进展日志，按模块/功能域归组，说明解决了哪些问题或完成了哪些事项。同一父任务下的多个子任务合并为一个条目描述（如"XX模块：完成了 A、B、C 三项子任务"）。

**新增的问题**：基于今日新建的任务或日志中提到的阻塞/问题，按模块归组说明出现了哪些新的待解决事项。

如果某一块无内容，写"无"。如果今日无任何进展，简要说明。

## 进展与特性
按模块/功能域聚类，描述当前正在推进的功能特性和工作进展：
- 每个聚类用**粗体标题**标识模块/主题名
- 下方用 1-2 句话概括该模块的整体进展（进度百分比、关键里程碑）
- 父任务代表模块主题，子任务进展合并描述，不要逐个子任务单独成行
- 重点突出今日有实质推进的部分，标注负责人（如有）

如果今日无特性进展，基于任务结构概括各模块当前状态。

## 风险提示
按风险类型聚类（不要逐个任务列出）：

- **逾期风险**：哪些模块/功能域存在已逾期或 3 天内到期的任务，涉及几个任务，影响范围
- **停滞风险**：哪些模块的 P0/P1 任务最近 3 天无进展，可能需要关注
- **依赖风险**：基于任务结构判断是否有前置任务未完成可能阻塞后续

每类风险用一段话概括，标注涉及的模块和严重程度。如果无风险项，说明"当前无明显风险"。

## 进行中概览
按模块/功能域分组展示所有未完成的工作：
- 每个分组用**粗体**标识模块名（通常对应一级父任务）
- 包含：整体进度、子任务完成情况（如 3/5 完成）、负责人、截止日
- 同一模块下的多个子任务合并为一句概括，不要逐行列表
- 按优先级从高到低排列各模块

规则：
- 只基于提供的数据，不捏造，不给建议
- 简洁直接，段落化表达优于列表罗列
- 中文输出`;

function buildTaskTreeText(allTasks: Task[], parentId: string | undefined, indent: number): string {
  const children = allTasks.filter((t) =>
    parentId
      ? t.parent_id === parentId || (t.space_id === parentId && !t.parent_id)
      : t.id === allTasks[0]?.id
  );
  return children
    .map((t) => {
      const status = t.status === 2 ? "已完成" : "待办";
      const priority = `P${t.priority}`;
      const due = t.due_date
        ? ` 截止:${new Date(t.due_date).toLocaleDateString("zh-CN")}`
        : "";
      const assignee = t.assignee_email
        ? ` @${t.assignee_email.split("@")[0]}`
        : "";
      const desc = t.description ? ` | ${t.description.slice(0, 80)}` : "";
      const prog = ` 进度:${t.progress}%`;
      const prefix = "  ".repeat(indent) + "- ";
      const line = `${prefix}[${status}][${priority}] ${t.title}${due}${assignee}${prog}${desc}`;
      const childLines = buildTaskTreeText(allTasks, t.id, indent + 1);
      return childLines ? `${line}\n${childLines}` : line;
    })
    .join("\n");
}

function formatLogs(logs: TaskLog[], taskIdToTitle: Map<string, string>): string {
  return logs
    .map((l) => {
      const d = new Date(l.created_at);
      return `- [${d.toLocaleDateString("zh-CN")} ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}] ${l.user_email.split("@")[0]} → 任务「${taskIdToTitle.get(l.task_id) ?? "未知"}」: ${l.content}`;
    })
    .join("\n");
}

function buildUserMessage(
  parentTask: Task,
  descendants: Task[],
  allLogs: TaskLog[],
  todayLogs: TaskLog[],
  date: string
): string {
  const allTasks = [parentTask, ...descendants];
  const taskIdToTitle = new Map(allTasks.map((t) => [t.id, t.title]));

  const childrenTree = buildTaskTreeText(allTasks, parentTask.id, 1);
  const fullTree = `- [${parentTask.status === 2 ? "已完成" : "待办"}][P${parentTask.priority}] ${parentTask.title}\n${childrenTree}`;

  const allLogsText =
    allLogs.length > 0
      ? formatLogs(allLogs, taskIdToTitle)
      : "暂无进展日志";

  const todayLogsText =
    todayLogs.length > 0
      ? formatLogs(todayLogs, taskIdToTitle)
      : "今日暂无进展日志";

  const totalCount = allTasks.length;
  const completedCount = allTasks.filter((t) => t.status === 2).length;
  const pendingCount = totalCount - completedCount;

  return `日期: ${date}
项目: ${parentTask.title}
统计: 共 ${totalCount} 个任务，${completedCount} 已完成，${pendingCount} 待办

## 任务结构
${fullTree}

## 全部进展日志（共 ${allLogs.length} 条）
${allLogsText}

## 今日进展日志
${todayLogsText}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromRequest(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();
  const { id } = await params;

  const task = await getTaskForUser(id, user.id);
  if (!task)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { date?: string };
  const date = body.date || new Date().toISOString().slice(0, 10);

  const descendants = await getDescendantTasks(id);
  const allTaskIds = [id, ...descendants.map((t) => t.id)];
  const allLogs = await getLogsForTasks(allTaskIds, 500);
  const todayLogs = allLogs.filter((l) => l.created_at.slice(0, 10) === date);

  const llm = new LLMClient();

  // Try with full data first; fallback to recent-only if too large
  async function tryGenerate(logs: TaskLog[]): Promise<ReadableStream<string>> {
    const userMessage = buildUserMessage(task!, descendants, logs, todayLogs, date);
    return llm.chatStream(
      [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      0.3
    );
  }

  let stream: ReadableStream<string>;
  try {
    stream = await tryGenerate(allLogs);
  } catch {
    // Fallback: only keep logs from last 7 days
    const sevenDaysAgo = new Date(date);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentLogs = allLogs.filter(
      (l) => new Date(l.created_at) >= sevenDaysAgo
    );
    stream = await tryGenerate(recentLogs);
  }

  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
