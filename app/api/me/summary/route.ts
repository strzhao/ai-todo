import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import {
  initDb,
  getPersonalSummaryCache,
  upsertPersonalSummaryCache,
  getSummaryUsageCount,
  incrementSummaryUsage,
} from "@/lib/db";
import {
  getPersonalDaySummaryData,
  hasPersonalDayContent,
} from "@/lib/daily-digest";
import { LLMClient } from "@/lib/llm-client";
import type { PersonalDaySummaryData } from "@/lib/daily-digest";
import type { Task } from "@/lib/types";

export const preferredRegion = "hkg1";
export const maxDuration = 60;

const DAILY_LIMIT = 10;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SYSTEM_PROMPT = `你是一个个人效率助手，为用户生成每日工作总结。按项目/空间聚类，聚焦产出和进展。使用 Markdown 格式。
输出：## 今日概览（一句话）→ ## 主要成果（按项目分组）→ ## 待关注事项（逾期/到期）→ ## 明日建议（2-3条）
注意：
- 语言简洁，突出关键信息
- 如果有多个项目空间，按空间分组展示
- 没有内容的章节可以省略
- 逾期任务要标注逾期天数`;

function buildUserMessage(data: PersonalDaySummaryData, date: string): string {
  const sections: string[] = [`日期: ${date}`];

  if (data.completedTasks.length > 0) {
    sections.push(
      `\n## 今日完成的任务（${data.completedTasks.length} 个）\n${formatTasks(data.completedTasks, data.spaceNames)}`
    );
  }

  if (data.createdTasks.length > 0) {
    sections.push(
      `\n## 今日新建的任务（${data.createdTasks.length} 个）\n${formatTasks(data.createdTasks, data.spaceNames)}`
    );
  }

  if (data.logs.length > 0) {
    sections.push(
      `\n## 今日进展日志（${data.logs.length} 条）\n${data.logs
        .map(
          (l) =>
            `- 任务「${l.task_title}」: ${l.content.slice(0, 120)}`
        )
        .join("\n")}`
    );
  }

  if (data.overdueTasks.length > 0) {
    sections.push(
      `\n## 逾期任务（${data.overdueTasks.length} 个）\n${data.overdueTasks
        .map((t) => {
          const dueDate = t.due_date
            ? new Date(t.due_date).toLocaleDateString("zh-CN")
            : "";
          const spaceName = t.space_id ? data.spaceNames[t.space_id] : null;
          return `- ${t.title}${dueDate ? ` (截止 ${dueDate})` : ""}${spaceName ? ` [${spaceName}]` : ""}`;
        })
        .join("\n")}`
    );
  }

  if (data.dueTodayTasks.length > 0) {
    sections.push(
      `\n## 今日到期任务（${data.dueTodayTasks.length} 个）\n${formatTasks(data.dueTodayTasks, data.spaceNames)}`
    );
  }

  return sections.join("\n");
}

function formatTasks(tasks: Task[], spaceNames: Record<string, string>): string {
  return tasks
    .map((t) => {
      const priority = `P${t.priority}`;
      const spaceName = t.space_id ? spaceNames[t.space_id] : null;
      const due = t.due_date
        ? ` 截止:${new Date(t.due_date).toLocaleDateString("zh-CN")}`
        : "";
      return `- [${priority}] ${t.title}${due}${spaceName ? ` [${spaceName}]` : ""}`;
    })
    .join("\n");
}

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();

  const dateParam = req.nextUrl.searchParams.get("date");
  const date = dateParam && DATE_RE.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);

  const [cached, used] = await Promise.all([
    getPersonalSummaryCache(user.id, date),
    getSummaryUsageCount(user.id, date),
  ]);

  const quota = {
    used,
    limit: DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - used),
  };

  if (!cached) {
    return NextResponse.json({ cached: false, quota });
  }

  return NextResponse.json({
    cached: true,
    content: cached.content,
    generated_at: cached.generated_at,
    quota,
  });
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();

  const body = (await req.json().catch(() => ({}))) as { date?: string };
  const date = body.date && DATE_RE.test(body.date) ? body.date : new Date().toISOString().slice(0, 10);

  // Quota check
  const used = await getSummaryUsageCount(user.id, date);
  if (used >= DAILY_LIMIT) {
    return NextResponse.json(
      {
        error: `今日生成次数已达上限（${DAILY_LIMIT}次）`,
        quota: { used, limit: DAILY_LIMIT, remaining: 0 },
      },
      { status: 429 }
    );
  }

  // Gather data
  const data = await getPersonalDaySummaryData(user.id, date);
  if (!hasPersonalDayContent(data)) {
    return NextResponse.json(
      { error: "当日没有任务活动" },
      { status: 400 }
    );
  }

  const userMessage = buildUserMessage(data, date);

  const llm = new LLMClient();
  const stream = await llm.chatStream(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    0.3
  );

  // Wrap stream to collect content and save on completion
  let fullContent = "";
  const saveStream = new TransformStream<string, string>({
    transform(chunk, controller) {
      fullContent += chunk;
      controller.enqueue(chunk);
    },
    async flush() {
      if (fullContent.trim()) {
        await Promise.all([
          upsertPersonalSummaryCache(user!.id, date, fullContent),
          incrementSummaryUsage(user!.id, date),
        ]);
      }
    },
  });

  return new Response(
    stream.pipeThrough(saveStream).pipeThrough(new TextEncoderStream()),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    }
  );
}
