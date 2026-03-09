import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, getTaskForUser, getDescendantTasks, getLogsForTasks, getTaskMembers } from "@/lib/db";
import { getDisplayLabel } from "@/lib/display-utils";
import { LLMClient } from "@/lib/llm-client";
import type { Task, TaskLog } from "@/lib/types";

export const preferredRegion = "hkg1";
export const maxDuration = 60;

const SUMMARY_SYSTEM_PROMPT = `你是一个项目管理助手，为 PM 生成简洁的项目总结。

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

function buildTaskTreeText(allTasks: Task[], parentId: string | undefined, indent: number, nameMap: Map<string, string>): string {
  const children = allTasks.filter((t) =>
    parentId
      ? t.parent_id === parentId || (t.space_id === parentId && !t.parent_id)
      : t.id === allTasks[0]?.id
  );
  return children
    .map((t) => {
      const status = t.status === 2
        ? `已完成${t.completed_at ? ` ${new Date(t.completed_at).toLocaleDateString("zh-CN")}` : ""}`
        : "待办";
      const priority = `P${t.priority}`;
      const due = t.due_date
        ? ` 截止:${new Date(t.due_date).toLocaleDateString("zh-CN")}`
        : "";
      const assignee = t.assignee_email
        ? ` @${nameMap.get(t.assignee_email) ?? t.assignee_email.split("@")[0]}`
        : "";
      const desc = t.description ? ` | ${t.description.slice(0, 80)}` : "";
      const prog = ` 进度:${t.progress}%`;
      const prefix = "  ".repeat(indent) + "- ";
      const line = `${prefix}[${status}][${priority}] ${t.title}${due}${assignee}${prog}${desc}`;
      const childLines = buildTaskTreeText(allTasks, t.id, indent + 1, nameMap);
      return childLines ? `${line}\n${childLines}` : line;
    })
    .join("\n");
}

function formatLogs(logs: TaskLog[], taskIdToTitle: Map<string, string>, nameMap: Map<string, string>): string {
  return logs
    .map((l) => {
      const d = new Date(l.created_at);
      const userName = nameMap.get(l.user_email) ?? l.user_email.split("@")[0];
      return `- [${d.toLocaleDateString("zh-CN")} ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}] ${userName} → 任务「${taskIdToTitle.get(l.task_id) ?? "未知"}」: ${l.content}`;
    })
    .join("\n");
}

function buildUserMessage(
  parentTask: Task,
  descendants: Task[],
  allLogs: TaskLog[],
  todayLogs: TaskLog[],
  date: string,
  nameMap: Map<string, string>
): string {
  const allTasks = [parentTask, ...descendants];
  const taskIdToTitle = new Map(allTasks.map((t) => [t.id, t.title]));

  const childrenTree = buildTaskTreeText(allTasks, parentTask.id, 1, nameMap);
  const fullTree = `- [${parentTask.status === 2 ? "已完成" : "待办"}][P${parentTask.priority}] ${parentTask.title}\n${childrenTree}`;

  const allLogsText =
    allLogs.length > 0
      ? formatLogs(allLogs, taskIdToTitle, nameMap)
      : "暂无进展日志";

  const todayLogsText =
    todayLogs.length > 0
      ? formatLogs(todayLogs, taskIdToTitle, nameMap)
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
  const [allLogs, members] = await Promise.all([
    getLogsForTasks(allTaskIds, 500),
    getTaskMembers(id),
  ]);
  const todayLogs = allLogs.filter((l) => l.created_at.slice(0, 10) === date);
  const nameMap = new Map(members.map((m) => [m.email, getDisplayLabel(m.email, m)]));

  const llm = new LLMClient();

  // Try with full data first; fallback to recent-only if too large
  async function tryGenerate(logs: TaskLog[]): Promise<ReadableStream<string>> {
    const userMessage = buildUserMessage(task!, descendants, logs, todayLogs, date, nameMap);
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
