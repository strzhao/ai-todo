// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DailyDigestNotificationDetail } from "@/components/DailyDigestNotificationDetail";
import type { AppNotification } from "@/lib/types";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "n-1",
    user_id: "user-1",
    type: "daily_digest",
    title: "每日摘要 · 2026-03-31",
    body: "2 个逾期，今天 1 个到期",
    read: false,
    created_at: "2026-03-31T01:00:00.000Z",
    ...overrides,
  };
}

describe("DailyDigestNotificationDetail", () => {
  it("renders structured digest snapshot with metrics and overflow hint", () => {
    render(
      <DailyDigestNotificationDetail
        notification={makeNotification({
          data: {
            daily_digest: {
              date: "2026-03-31",
              headline: "先处理 2 个逾期任务，今天还有 1 个到期",
              metrics: [
                { key: "overdue", label: "逾期", count: 2 },
                { key: "due_today", label: "今日到期", count: 1 },
                { key: "completed", label: "昨日完成", count: 3 },
                { key: "logs", label: "昨日进展", count: 1 },
              ],
              sections: [
                {
                  key: "overdue",
                  title: "已过期任务",
                  count: 5,
                  overflow_count: 1,
                  items: [
                    {
                      kind: "task",
                      task_id: "t-1",
                      space_id: "s-1",
                      title: "补项目排期",
                      meta: "增长实验 · P0 · 截止 2026/3/28 · 逾期 3 天",
                    },
                  ],
                },
                {
                  key: "logs",
                  title: "昨日进展",
                  count: 1,
                  overflow_count: 0,
                  items: [
                    {
                      kind: "log",
                      task_id: "t-2",
                      space_id: "s-1",
                      title: "接口联调",
                      meta: "增长实验 · 进展记录",
                      excerpt: "剩下 2 个错误码需要补齐，明早继续处理。",
                    },
                  ],
                },
              ],
            },
          },
        })}
      />
    );

    expect(screen.getByText("先处理 2 个逾期任务，今天还有 1 个到期")).toBeInTheDocument();
    expect(screen.getByText("逾期")).toBeInTheDocument();
    expect(screen.getByText("5 项", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("另 1 项")).toBeInTheDocument();
    expect(screen.getByText("补项目排期")).toBeInTheDocument();
    expect(screen.getByText("接口联调")).toBeInTheDocument();
    expect(screen.getByText("剩下 2 个错误码需要补齐，明早继续处理。")).toBeInTheDocument();
  });

  it("falls back for legacy digest notifications without structured data", () => {
    render(
      <DailyDigestNotificationDetail
        notification={makeNotification({
          data: undefined,
          body: "已过期任务: 3项、今日到期: 2项",
        })}
      />
    );

    expect(screen.getByText("已过期任务: 3项、今日到期: 2项")).toBeInTheDocument();
    expect(screen.getByText("这是旧版每日摘要通知，未保存结构化明细。")).toBeInTheDocument();
  });
});
