import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { initDb, getTaskForUser, getDescendantTasks, getLogsForTasks, getTaskMembers, getSummaryCache, upsertSummaryCache, getSummaryUsageCount, incrementSummaryUsage, getSummaryConfig } from "@/lib/db";
import { getDisplayLabel } from "@/lib/display-utils";
import { requireSpaceMember, getSpaceMember } from "@/lib/spaces";
import { LLMClient } from "@/lib/llm-client";
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_DATA_TEMPLATE } from "@/app/api/spaces/[id]/summary-config/route";
import { allocateCharBudget, buildCompressedSpaceText, truncateText, compressTaskTree, LINKED_SPACES_TOTAL_CHAR_LIMIT, MAIN_SPACE_CHAR_LIMIT } from "@/lib/summary-utils";
import type { Task, TaskLog, SummaryDataSource, LinkedSpace } from "@/lib/types";

export const preferredRegion = "hkg1";
export const maxDuration = 60;

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
      const directChildren = allTasks.filter(c => c.parent_id === t.id);
      let prog: string;
      if (directChildren.length > 0) {
        const done = directChildren.filter(c => c.status === 2).length;
        prog = ` 完成:${done}/${directChildren.length}(${Math.round(done / directChildren.length * 100)}%)`;
      } else {
        prog = t.progress > 0 ? ` 进度:${t.progress}%` : "";
      }
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

function buildDefaultUserMessage(
  parentTask: Task,
  descendants: Task[],
  allLogs: TaskLog[],
  todayLogs: TaskLog[],
  date: string,
  nameMap: Map<string, string>,
  linkedSpacesText?: string
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

  let msg = `日期: ${date}
项目: ${parentTask.title}
统计: 共 ${totalCount} 个任务，${completedCount} 已完成，${pendingCount} 待办

## 任务结构
${fullTree}

## 全部进展日志（共 ${allLogs.length} 条）
${allLogsText}

## 今日进展日志
${todayLogsText}`;

  if (linkedSpacesText) {
    msg += `\n\n## 关联空间数据\n${linkedSpacesText}`;
  }

  return truncateText(msg, MAIN_SPACE_CHAR_LIMIT);
}

// ─── Template rendering ──────────────────────────────────────────────────────

function buildTemplateVariables(
  parentTask: Task,
  descendants: Task[],
  allLogs: TaskLog[],
  todayLogs: TaskLog[],
  date: string,
  nameMap: Map<string, string>,
  dsResults: Record<string, string>,
  linkedSpacesText?: string
): { vars: Record<string, string>; truncated: boolean } {
  const allTasks = [parentTask, ...descendants];
  const taskIdToTitle = new Map(allTasks.map((t) => [t.id, t.title]));

  const totalCount = allTasks.length;
  const completedCount = allTasks.filter((t) => t.status === 2).length;
  const pendingCount = totalCount - completedCount;

  const vars: Record<string, string> = {
    date,
    project_name: parentTask.title,
    task_tree: "", // filled below
    all_logs: allLogs.length > 0
      ? formatLogs(allLogs, taskIdToTitle, nameMap)
      : "暂无进展日志",
    today_logs: todayLogs.length > 0
      ? formatLogs(todayLogs, taskIdToTitle, nameMap)
      : "今日暂无进展日志",
    stats: `共 ${totalCount} 个任务，${completedCount} 已完成，${pendingCount} 待办`,
    linked_spaces: linkedSpacesText ? `## 关联空间数据\n${linkedSpacesText}` : "",
  };

  // Inject data source results as ds.xxx
  for (const [key, value] of Object.entries(dsResults)) {
    vars[`ds.${key}`] = value;
  }

  // Calculate budget for task_tree: total limit minus other fields
  const otherChars = Object.entries(vars).reduce(
    (sum, [k, v]) => (k === "task_tree" ? sum : sum + v.length), 0
  );
  const treeLimit = Math.max(4000, MAIN_SPACE_CHAR_LIMIT - otherChars);

  // Smart compression: preserve all modules, collapse inactive subtasks
  const { text: treeText, compressed } = compressTaskTree(
    allTasks, parentTask.id, nameMap, allLogs, date, treeLimit
  );
  vars.task_tree = treeText;

  // Also cap logs if still over total limit
  const totalChars = Object.values(vars).reduce((sum, v) => sum + v.length, 0);
  let truncated = compressed;
  if (totalChars > MAIN_SPACE_CHAR_LIMIT) {
    const logsLimit = Math.floor(MAIN_SPACE_CHAR_LIMIT * 0.3);
    vars.all_logs = truncateText(vars.all_logs, logsLimit);
    truncated = true;
  }

  return { vars, truncated };
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
    const trimmed = key.trim();
    return vars[trimmed] ?? match;
  });
}

// ─── External data source fetching ───────────────────────────────────────────

/** Simple dot-path extraction from a JSON object, e.g. "data.items" */
function extractByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function replaceTemplateVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
    const trimmed = key.trim();
    return vars[trimmed] ?? match;
  });
}

async function fetchDataSources(
  sources: SummaryDataSource[],
  contextVars: Record<string, string>
): Promise<Record<string, string>> {
  const enabled = sources.filter((s) => s.enabled);
  if (enabled.length === 0) return {};

  const results: Record<string, string> = {};

  await Promise.allSettled(
    enabled.map(async (source) => {
      const timeout = source.timeout_ms ?? 10000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const url = replaceTemplateVars(source.url, contextVars);
        const headers: Record<string, string> = {
          "User-Agent": "AI-Todo-Bot/1.0",
        };
        if (source.headers) {
          for (const [k, v] of Object.entries(source.headers)) {
            headers[k] = replaceTemplateVars(v, contextVars);
          }
        }

        const fetchOptions: RequestInit = {
          method: source.method,
          headers,
          signal: controller.signal,
        };

        if (source.method === "POST" && source.body_template) {
          fetchOptions.body = replaceTemplateVars(source.body_template, contextVars);
          if (!headers["Content-Type"] && !headers["content-type"]) {
            headers["Content-Type"] = "application/json";
          }
        }

        const res = await fetch(url, fetchOptions);
        const text = await res.text();

        if (!res.ok) {
          console.error(`[datasource] ${source.name} failed: HTTP ${res.status}, url=${url}, response=${text.slice(0, 200)}`);
          results[source.inject_as] = `[数据源「${source.name}」请求失败: HTTP ${res.status}]`;
          return;
        }

        if (source.response_extract) {
          try {
            const json = JSON.parse(text);
            const extracted = extractByPath(json, source.response_extract);
            results[source.inject_as] = typeof extracted === "string"
              ? extracted
              : JSON.stringify(extracted, null, 2);
          } catch {
            results[source.inject_as] = text;
          }
        } else {
          results[source.inject_as] = text;
        }
      } catch (err) {
        const isAbort = (err as { name?: string }).name === "AbortError";
        const cause = (err as { cause?: unknown }).cause;
        console.error(`[datasource] ${source.name} exception: name=${(err as Error).name} msg=${(err as Error).message} cause=${cause ? JSON.stringify(cause) : "none"}`);
        results[source.inject_as] = `[数据源「${source.name}」${isAbort ? "请求超时" : "获取失败"}]`;
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return results;
}

// ─── Quota ────────────────────────────────────────────────────────────────────

async function getQuotaInfo(userId: string, spaceId: string | undefined, date: string) {
  const member = spaceId ? await getSpaceMember(spaceId, userId) : null;
  const role = member?.role ?? "member";
  const limit = (role === "owner" || role === "admin") ? 100 : 10;
  const used = await getSummaryUsageCount(userId, date);
  return { used, limit, remaining: Math.max(0, limit - used) };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();
  const { id } = await params;

  const task = await getTaskForUser(id, user.id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const spaceId = task.pinned ? task.id : task.space_id;
  if (spaceId) {
    try {
      await requireSpaceMember(spaceId, user.id);
    } catch {
      return NextResponse.json({ error: "Not a space member" }, { status: 403 });
    }
  }

  const date = req.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const templateId = req.nextUrl.searchParams.get("template_id") || "default";
  const [cached, quota] = await Promise.all([
    getSummaryCache(id, date, templateId),
    getQuotaInfo(user.id, spaceId, date),
  ]);

  if (!cached) {
    return NextResponse.json({ cached: false, quota });
  }

  return NextResponse.json({
    cached: true,
    content: cached.content,
    generated_by: cached.generated_by,
    generated_at: cached.generated_at,
    quota,
  });
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

  const spaceId = task.pinned ? task.id : task.space_id;
  if (spaceId) {
    try {
      await requireSpaceMember(spaceId, user.id);
    } catch {
      return NextResponse.json(
        { error: "仅空间成员可生成 AI 总结" },
        { status: 403 }
      );
    }
  }

  const body = (await req.json().catch(() => ({}))) as { date?: string; template_id?: string };
  const date = body.date || new Date().toISOString().slice(0, 10);
  const templateId = body.template_id || "default";

  // Rate limiting
  const quota = await getQuotaInfo(user.id, spaceId, date);
  if (quota.remaining <= 0) {
    return NextResponse.json(
      { error: `今日生成次数已达上限（${quota.limit}次）`, quota },
      { status: 429 }
    );
  }

  // Load custom config (if any)
  const config = spaceId ? await getSummaryConfig(spaceId) : null;

  // Resolve system prompt and data template based on template_id
  let systemPrompt: string;
  let dataTemplate: string | null = null;
  if (templateId === "default") {
    systemPrompt = config?.system_prompt ?? DEFAULT_SYSTEM_PROMPT;
    dataTemplate = config?.data_template ?? null;
  } else {
    const template = config?.prompt_templates?.find((t) => t.id === templateId);
    if (!template) {
      return NextResponse.json({ error: "模板不存在" }, { status: 404 });
    }
    systemPrompt = template.system_prompt ?? DEFAULT_SYSTEM_PROMPT;
    dataTemplate = template.data_template ?? null;
  }

  const descendants = await getDescendantTasks(id);
  const allTaskIds = [id, ...descendants.map((t) => t.id)];
  const [allLogs, members] = await Promise.all([
    getLogsForTasks(allTaskIds, 500),
    getTaskMembers(id),
  ]);
  const todayLogs = allLogs.filter((l) => l.created_at.slice(0, 10) === date);
  const nameMap = new Map(members.map((m) => [m.email, getDisplayLabel(m.email, m)]));

  // Fetch external data sources
  const basicVars: Record<string, string> = { date, project_name: task.title };
  const dsResults = config?.data_sources?.length
    ? await fetchDataSources(config.data_sources, basicVars)
    : {};

  // Fetch linked spaces data (with smart compression)
  const linkedSpaces = (config?.linked_spaces?.filter((ls: LinkedSpace) => ls.enabled) ?? []) as LinkedSpace[];
  let linkedSpacesText = "";

  if (linkedSpaces.length > 0) {
    const charBudget = allocateCharBudget(LINKED_SPACES_TOTAL_CHAR_LIMIT, linkedSpaces.length);

    const linkedResults = await Promise.all(
      linkedSpaces.map(async (ls) => {
        try {
          // Permission check
          const member = await getSpaceMember(ls.space_id, user!.id);
          if (!member) return null;

          // Get space root task
          const spaceTask = await getTaskForUser(ls.space_id, user!.id);
          if (!spaceTask) return null;

          const [spaceDescendants, spaceMembers] = await Promise.all([
            getDescendantTasks(ls.space_id),
            getTaskMembers(ls.space_id),
          ]);

          const truncatedDescendants = spaceDescendants.slice(0, 200);
          const spaceTaskIds = [ls.space_id, ...truncatedDescendants.map((t) => t.id)];
          const spaceLogs = await getLogsForTasks(spaceTaskIds, 100);

          const spaceNameMap = new Map(spaceMembers.map((m) => [m.email, getDisplayLabel(m.email, m)]));
          const allSpaceTasks = [spaceTask, ...truncatedDescendants];

          return buildCompressedSpaceText(
            spaceTask.title,
            allSpaceTasks,
            spaceLogs,
            date,
            spaceNameMap,
            charBudget
          );
        } catch {
          console.warn(`[linked-space] Failed to fetch space ${ls.space_id}`);
          return null;
        }
      })
    );

    const validResults = linkedResults.filter(Boolean);
    if (validResults.length > 0) {
      linkedSpacesText = truncateText(validResults.join("\n\n"), LINKED_SPACES_TOTAL_CHAR_LIMIT);
    }
  }

  const llm = new LLMClient();

  // Build user message: custom template or default
  let dataTruncated = false;
  function buildMessage(logs: TaskLog[]): string {
    if (dataTemplate) {
      const { vars, truncated } = buildTemplateVariables(task!, descendants, logs, todayLogs, date, nameMap, dsResults, linkedSpacesText);
      dataTruncated = truncated;
      return renderTemplate(dataTemplate, vars);
    }
    // Default path: use original buildDefaultUserMessage + append data source results
    let msg = buildDefaultUserMessage(task!, descendants, logs, todayLogs, date, nameMap, linkedSpacesText);
    if (Object.keys(dsResults).length > 0) {
      msg += "\n\n## 外部数据源";
      for (const [key, value] of Object.entries(dsResults)) {
        msg += `\n\n### ${key}\n${value}`;
      }
    }
    return msg;
  }

  // Try with full data first; fallback to recent-only if too large
  async function tryGenerate(logs: TaskLog[]): Promise<ReadableStream<string>> {
    const userMessage = buildMessage(logs);
    return llm.chatStream(
      [
        { role: "system", content: systemPrompt },
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

  // Wrap stream to collect content and save to DB cache on completion
  let fullContent = "";
  const saveStream = new TransformStream<string, string>({
    transform(chunk, controller) {
      fullContent += chunk;
      controller.enqueue(chunk);
    },
    async flush() {
      if (fullContent.trim()) {
        await Promise.all([
          upsertSummaryCache(id, date, fullContent, user!.id, templateId),
          incrementSummaryUsage(user!.id, date),
        ]);
      }
    },
  });

  return new Response(stream.pipeThrough(saveStream).pipeThrough(new TextEncoderStream()), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Data-Truncated": dataTruncated ? "1" : "0",
    },
  });
}
