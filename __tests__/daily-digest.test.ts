import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/types";
import {
  buildDailyDigestNotification,
  buildDigestSections,
  type DigestData,
} from "@/lib/daily-digest";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? `task-${Math.random().toString(36).slice(2, 8)}`,
    user_id: "user-1",
    title: overrides.title ?? "默认任务",
    priority: overrides.priority ?? 2,
    status: overrides.status ?? 0,
    tags: overrides.tags ?? [],
    sort_order: overrides.sort_order ?? 0,
    created_at: overrides.created_at ?? "2026-03-30T08:00:00.000Z",
    progress: overrides.progress ?? 0,
    ...overrides,
  };
}

describe("daily digest notification snapshot", () => {
  it("builds a rich snapshot with headline, counts, and overflowed sections", () => {
    const data: DigestData = {
      overdueTasks: [
        makeTask({ id: "o1", title: "补项目排期", priority: 0, due_date: "2026-03-28T00:00:00.000Z", space_id: "space-a", progress: 40 }),
        makeTask({ id: "o2", title: "整理客户反馈", priority: 1, due_date: "2026-03-29T00:00:00.000Z", space_id: "space-a" }),
        makeTask({ id: "o3", title: "确认联调窗口", priority: 1, due_date: "2026-03-29T00:00:00.000Z", space_id: "space-a" }),
        makeTask({ id: "o4", title: "更新发布 checklist", priority: 2, due_date: "2026-03-30T00:00:00.000Z", space_id: "space-a" }),
        makeTask({ id: "o5", title: "补监控告警", priority: 2, due_date: "2026-03-30T00:00:00.000Z", space_id: "space-a" }),
      ],
      dueTodayTasks: [
        makeTask({ id: "d1", title: "今日上线检查", priority: 1, due_date: "2026-03-31T00:00:00.000Z", space_id: "space-b" }),
      ],
      completedYesterday: [
        makeTask({ id: "c1", title: "完成周报", priority: 2, status: 2, completed_at: "2026-03-30T12:00:00.000Z", space_id: "space-b" }),
      ],
      logsYesterday: [
        {
          id: "l1",
          task_id: "task-log-1",
          user_id: "user-1",
          user_email: "user@example.com",
          task_title: "接口联调",
          content: "已和服务端确认字段格式，剩下 2 个错误码需要补齐，明早继续处理。",
          created_at: "2026-03-30T15:00:00.000Z",
          space_id: "space-a",
        },
      ],
      spaceNames: {
        "space-a": "增长实验",
        "space-b": "官网改版",
      },
    };

    const notification = buildDailyDigestNotification(data, "2026-03-31");
    const snapshot = notification.data.daily_digest;

    expect(notification.title).toBe("每日摘要 · 2026-03-31");
    expect(notification.body).toContain("5 个逾期");
    expect(notification.body).toContain("今天 1 个到期");
    expect(snapshot?.headline).toBe("先处理 5 个逾期任务，今天还有 1 个到期");

    const overdueSection = snapshot?.sections.find((section) => section.key === "overdue");
    expect(overdueSection?.count).toBe(5);
    expect(overdueSection?.items).toHaveLength(4);
    expect(overdueSection?.overflow_count).toBe(1);
    expect(overdueSection?.items[0]?.meta).toContain("增长实验");
    expect(overdueSection?.items[0]?.meta).toContain("逾期");

    const logSection = snapshot?.sections.find((section) => section.key === "logs");
    expect(logSection?.items[0]?.title).toBe("接口联调");
    expect(logSection?.items[0]?.excerpt).toContain("剩下 2 个错误码需要补齐");
  });

  it("builds email sections with concrete detail strings", () => {
    const data: DigestData = {
      overdueTasks: [
        makeTask({
          id: "o1",
          title: "补项目排期",
          priority: 0,
          due_date: "2026-03-28T00:00:00.000Z",
          space_id: "space-a",
        }),
      ],
      dueTodayTasks: [
        makeTask({
          id: "d1",
          title: "今日上线检查",
          priority: 1,
          due_date: "2026-03-31T00:00:00.000Z",
          space_id: "space-b",
        }),
      ],
      completedYesterday: [
        makeTask({
          id: "c1",
          title: "完成周报",
          priority: 2,
          status: 2,
          completed_at: "2026-03-30T12:00:00.000Z",
          space_id: "space-b",
        }),
      ],
      logsYesterday: [
        {
          id: "l1",
          task_id: "t-log",
          user_id: "user-1",
          user_email: "user@example.com",
          task_title: "接口联调",
          content: "准备联调环境并同步异常处理策略",
          created_at: "2026-03-30T15:00:00.000Z",
          space_id: "space-a",
        },
      ],
      spaceNames: {
        "space-a": "增长实验",
        "space-b": "官网改版",
      },
    };

    const sections = buildDigestSections(data, "2026-03-31");

    expect(sections[0]?.items[0]).toContain("补项目排期");
    expect(sections[0]?.items[0]).toContain("[增长实验]");
    expect(sections[0]?.items[0]).toContain("逾期");
    expect(sections[1]?.items[0]).toContain("今日到期");
    expect(sections[2]?.items[0]).toContain("昨日完成");
    expect(sections[3]?.items[0]).toContain("接口联调");
    expect(sections[3]?.items[0]).toContain("准备联调环境");
  });
});
