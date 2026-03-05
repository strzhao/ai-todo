import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, getTaskForUser, getDescendantTasks, getLogsForTasksByDate } from "@/lib/db";
import { LLMClient } from "@/lib/llm-client";
import type { Task, TaskLog } from "@/lib/types";

export const preferredRegion = "hkg1";
export const maxDuration = 60;

const SUMMARY_SYSTEM_PROMPT = `你是一个项目管理助手，为 PM 生成简洁、可执行的每日项目总结。

输出格式（Markdown）：

## 今日概览
一段话总结项目当前状态和今日变化。包含关键数字：总任务数、已完成数、完成率、今日新增完成数。

## 关键进展
按重要性列出今日有实际更新的任务（基于进展日志）。每条包含：
- 任务名称及其层级位置（父任务 › 子任务）
- 具体进展内容
- 负责人（如有）

如果今日无进展日志，说明"今日暂无进展更新"并跳过此节。

## 风险与建议
- 指出已逾期或 3 天内到期的任务（标注逾期天数或剩余天数）
- 标注高优先级（P0/P1）但无近期进展的任务
- 给出 1-2 条可操作的建议

规则：
- 只基于提供的数据，不捏造
- 简洁直接，每节 3-5 条
- 中文输出
- 层级关系用 › 连接展示`;

function buildTaskTreeText(allTasks: Task[], parentId: string | undefined, indent: number): string {
  const children = allTasks.filter((t) =>
    parentId ? t.parent_id === parentId : t.id === allTasks[0]?.id
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
      const prefix = "  ".repeat(indent) + "- ";
      const line = `${prefix}[${status}][${priority}] ${t.title}${due}${assignee}`;
      const childLines = buildTaskTreeText(allTasks, t.id, indent + 1);
      return childLines ? `${line}\n${childLines}` : line;
    })
    .join("\n");
}

function buildUserMessage(
  parentTask: Task,
  descendants: Task[],
  todayLogs: TaskLog[],
  date: string
): string {
  const allTasks = [parentTask, ...descendants];
  const taskIdToTitle = new Map(allTasks.map((t) => [t.id, t.title]));

  const childrenTree = buildTaskTreeText(allTasks, parentTask.id, 1);
  const fullTree = `- [${parentTask.status === 2 ? "已完成" : "待办"}][P${parentTask.priority}] ${parentTask.title}\n${childrenTree}`;

  const logsText =
    todayLogs.length > 0
      ? todayLogs
          .map(
            (l) =>
              `- [${new Date(l.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}] ${l.user_email.split("@")[0]} → 任务「${taskIdToTitle.get(l.task_id) ?? "未知"}」: ${l.content}`
          )
          .join("\n")
      : "今日暂无进展日志";

  const totalCount = allTasks.length;
  const completedCount = allTasks.filter((t) => t.status === 2).length;
  const pendingCount = totalCount - completedCount;

  return `日期: ${date}
项目: ${parentTask.title}
统计: 共 ${totalCount} 个任务，${completedCount} 已完成，${pendingCount} 待办

## 任务结构
${fullTree}

## 今日进展日志
${logsText}`;
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
  const todayLogs = await getLogsForTasksByDate(allTaskIds, date);

  const userMessage = buildUserMessage(task, descendants, todayLogs, date);

  const llm = new LLMClient();
  const stream = await llm.chatStream(
    [
      { role: "system", content: SUMMARY_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    0.3
  );

  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
