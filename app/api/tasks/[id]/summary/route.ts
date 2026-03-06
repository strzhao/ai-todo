import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, getTaskForUser, getDescendantTasks, getLogsForTasks } from "@/lib/db";
import { LLMClient } from "@/lib/llm-client";
import type { Task, TaskLog } from "@/lib/types";

export const preferredRegion = "hkg1";
export const maxDuration = 60;

const SUMMARY_SYSTEM_PROMPT = `你是一个项目管理助手，为 PM 生成简洁的每日项目总结。

你会收到完整的任务结构、全部历史进展日志和今日进展日志。历史日志仅作为背景参考，输出聚焦今日状态。

输出格式（Markdown），严格按以下顺序：

## 近期进展
优先展示今日进展日志。如果今日无进展，则展示最近 3 天内的进展日志。每条包含：
- 任务名称（父任务 › 子任务）
- 具体进展
- 负责人（如有）
- 日期（非今日的标注具体日期）

如果近 3 天内都无进展日志，说明"近期暂无进展更新"。

## 风险
- 已逾期或 3 天内到期的任务（标注天数）
- P0/P1 但最近 3 天无进展的任务

如果无风险项，说明"当前无风险项"。

## 进行中任务
用 Markdown 表格列出所有未完成的一级任务：

| 任务 | 完成率 | 负责人 | 截止日 | 状态 |
|------|--------|--------|--------|------|

- 完成率：子任务完成数/总数（如 3/5 60%），无子任务写"-"
- 负责人：无则写"-"
- 截止日：无则写"-"，已逾期加⚠️
- 状态：一句话概括当前进展（结合最近日志）

规则：
- 只基于提供的数据，不捏造
- 简洁直接，不给建议
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
  date: string
): string {
  const allTasks = [parentTask, ...descendants];
  const taskIdToTitle = new Map(allTasks.map((t) => [t.id, t.title]));

  const childrenTree = buildTaskTreeText(allTasks, parentTask.id, 1);
  const fullTree = `- [${parentTask.status === 2 ? "已完成" : "待办"}][P${parentTask.priority}] ${parentTask.title}\n${childrenTree}`;

  // Split logs into today and recent 3 days
  const todayDate = new Date(date);
  const threeDaysAgo = new Date(date);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const todayLogs = allLogs.filter((l) => l.created_at.slice(0, 10) === date);
  const recentLogs = allLogs.filter((l) => {
    const d = new Date(l.created_at);
    return d >= threeDaysAgo && d < todayDate;
  });

  const todayLogsText =
    todayLogs.length > 0
      ? formatLogs(todayLogs, taskIdToTitle)
      : "今日暂无进展日志";

  const recentLogsText =
    recentLogs.length > 0
      ? formatLogs(recentLogs, taskIdToTitle)
      : "近 3 天暂无进展日志";

  const totalCount = allTasks.length;
  const completedCount = allTasks.filter((t) => t.status === 2).length;
  const pendingCount = totalCount - completedCount;

  return `日期: ${date}
项目: ${parentTask.title}
统计: 共 ${totalCount} 个任务，${completedCount} 已完成，${pendingCount} 待办

## 任务结构
${fullTree}

## 今日进展日志
${todayLogsText}

## 近 3 天进展日志
${recentLogsText}

## 全部进展日志（共 ${allLogs.length} 条）
${allLogs.length > 0 ? formatLogs(allLogs, taskIdToTitle) : "暂无进展日志"}`;
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

  const llm = new LLMClient();

  // Try with full data first; fallback to recent-only if too large
  async function tryGenerate(logs: TaskLog[]): Promise<ReadableStream<string>> {
    const userMessage = buildUserMessage(task!, descendants, logs, date);
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
