import type { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

type SqlMock = ReturnType<typeof vi.fn> & {
  query: ReturnType<typeof vi.fn>;
};

function setupRouteMocks(options?: {
  users?: Array<{ user_id: string; email: string }>;
  existingRows?: Array<Record<string, unknown>>;
  prefs?: { daily_digest?: { inapp?: boolean; email?: boolean; push?: boolean } };
}) {
  vi.resetModules();

  const sql = Object.assign(
    vi.fn().mockResolvedValue({
      rows: options?.users ?? [{ user_id: "user-1", email: "user@example.com" }],
    }),
    {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: options?.existingRows ?? [] })
        .mockResolvedValueOnce({ rows: [{ id: "notif-1" }] })
        .mockResolvedValueOnce({ rows: [] }),
    }
  ) as SqlMock;

  const getUserNotificationPrefs = vi.fn().mockResolvedValue(
    options?.prefs ?? {
      daily_digest: { inapp: true, email: false, push: false },
    }
  );
  const getUserDigestData = vi.fn().mockResolvedValue({
    overdueTasks: [],
    dueTodayTasks: [],
    completedYesterday: [],
    logsYesterday: [],
    spaceNames: {},
  });
  const hasDigestContent = vi.fn().mockReturnValue(true);
  const buildDigestSections = vi.fn().mockReturnValue([]);
  const buildDailyDigestNotification = vi.fn().mockReturnValue({
    title: "每日摘要 · 2026-03-31",
    body: "2 个逾期，今天 1 个到期",
    data: {
      daily_digest: {
        date: "2026-03-31",
        headline: "先处理 2 个逾期任务，今天还有 1 个到期",
        metrics: [],
        sections: [],
      },
    },
  });
  const sendDigestEmail = vi.fn().mockResolvedValue(undefined);
  const sendPushToUser = vi.fn().mockResolvedValue(undefined);

  vi.doMock("@vercel/postgres", () => ({ sql }));
  vi.doMock("@/lib/db", () => ({ initDb: vi.fn() }));
  vi.doMock("@/lib/notifications", () => ({ getUserNotificationPrefs }));
  vi.doMock("@/lib/daily-digest", () => ({
    getUserDigestData,
    hasDigestContent,
    buildDigestSections,
    buildDailyDigestNotification,
  }));
  vi.doMock("@/lib/email-templates", () => ({
    buildDigestEmailHtml: vi.fn().mockReturnValue("<html />"),
  }));
  vi.doMock("@/lib/email", () => ({ sendDigestEmail }));
  vi.doMock("@/lib/push", () => ({ sendPushToUser }));

  return {
    sql,
    getUserNotificationPrefs,
    getUserDigestData,
    hasDigestContent,
    buildDigestSections,
    buildDailyDigestNotification,
    sendDigestEmail,
    sendPushToUser,
  };
}

describe("GET /api/cron/daily-digest", () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSecret == null) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  it("delivers in-app digest even when email is disabled", async () => {
    process.env.CRON_SECRET = "test-secret";
    const mocks = setupRouteMocks({
      prefs: {
        daily_digest: { inapp: true, email: false, push: false },
      },
    });

    const { GET } = await import("@/app/api/cron/daily-digest/route");
    const req = new Request("http://localhost/api/cron/daily-digest", {
      headers: { authorization: "Bearer test-secret" },
    });
    const res = await GET(req as NextRequest);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sent).toBe(1);
    expect(mocks.sendDigestEmail).not.toHaveBeenCalled();
    expect(mocks.sendPushToUser).not.toHaveBeenCalled();
    expect(mocks.buildDigestSections).not.toHaveBeenCalled();
    expect(mocks.sql.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ai_todo_notifications"),
      expect.arrayContaining(["user-1", "每日摘要 · 2026-03-31", "2 个逾期，今天 1 个到期"])
    );
    expect(mocks.sql.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ai_todo_digest_delivery"),
      expect.arrayContaining(["user-1", expect.any(String)])
    );
  });

  it("skips users already recorded in the delivery log", async () => {
    process.env.CRON_SECRET = "test-secret";
    const mocks = setupRouteMocks({
      existingRows: [{ exists: 1 }],
    });

    const { GET } = await import("@/app/api/cron/daily-digest/route");
    const req = new Request("http://localhost/api/cron/daily-digest", {
      headers: { authorization: "Bearer test-secret" },
    });
    const res = await GET(req as NextRequest);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
    expect(mocks.getUserDigestData).not.toHaveBeenCalled();
    expect(mocks.buildDailyDigestNotification).not.toHaveBeenCalled();
  });
});
