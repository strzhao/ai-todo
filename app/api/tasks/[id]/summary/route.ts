import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, getTaskForUser, getDescendantTasks, getLogsForTasks } from "@/lib/db";
import { LLMClient } from "@/lib/llm-client";
import type { Task, TaskLog } from "@/lib/types";

export const preferredRegion = "hkg1";
export const maxDuration = 60;

const SUMMARY_SYSTEM_PROMPT = `你是一个项目管理助手，为 PM 生成简洁、可执行的每日项目总结。重点是让 PM 一眼看到各进行中任务的进度和风险。

你会收到完整的任务结构、全部历史进展日志和今日进展日志。历史日志仅作为背景参考，帮助你理解项目脉络，输出应聚焦今日状态。

输出格式（Markdown）：

## 进行中任务进度
逐个列出所有进行中（未完成）的一级任务/模块，每个包含：
- 任务名称
- 子任务完成率（如：3/5 已完成 60%）
- 负责人（如有）
- 距截止日剩余天数（如有截止日），已逾期则标红
- 当前状态一句话描述（结合最近的进展日志判断）

无子任务的独立任务也需列出，标注其优先级和状态。

## 今日进展
按重要性列出今日有实际更新的任务（基于今日进展日志）。每条包含：
- 任务名称及其层级位置（父任务 › 子任务）
- 具体进展内容
- 负责人（如有）

如果今日无进展日志，说明"今日暂无进展更新"并跳过此节。

## 风险与建议
- 已逾期或 3 天内到期的任务（标注逾期天数或剩余天数）
- 高优先级（P0/P1）但最近 3 天无进展的任务
- 1-2 条可操作的建议

规则：
- 只基于提供的数据，不捏造
- 简洁直接，每节 3-5 条，不要过于冗长
- 中文输出
- 层级关系用 › 连接展示`;

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
      const prefix = "  ".repeat(indent) + "- ";
      const line = `${prefix}[${status}][${priority}] ${t.title}${due}${assignee}${desc}`;
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
