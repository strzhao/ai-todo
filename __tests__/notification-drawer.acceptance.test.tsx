/**
 * 验收测试：通知点击改为抽屉内展示
 *
 * 设计文档约定：
 * 1. 任务相关通知（有 task_id）：点击不跳转，打开 Sheet/抽屉展示 TaskDetail（standalone 模式），标记已读
 * 2. 每日摘要通知（type === 'daily_digest'）：点击不跳转，打开 Sheet/抽屉展示摘要内容
 * 3. 其他通知（无 task_id 且非 daily_digest，如 space_join_pending 等）：保留原有链接跳转
 * 4. GET /api/tasks/[id]：新增 GET handler，401 未认证 / 404 不存在 / 200 返回任务
 */

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppNotification } from "@/lib/types";
import { getNotificationUrl } from "@/lib/notification-utils";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";

afterEach(cleanup);

// Mock next/link to render a plain anchor (same pattern as existing NotificationItem.test.tsx)
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "n-1",
    user_id: "u1",
    type: "task_assigned",
    title: "你被指派了新任务",
    body: "写周报",
    read: false,
    created_at: new Date().toISOString(),
    task_id: "t-1",
    space_id: "s-1",
    ...overrides,
  };
}

// ── AC-1: 任务相关通知（有 task_id）不应渲染为链接 ─────────────────────────────

describe("AC-1: 任务相关通知点击不跳转，改为抽屉展示", () => {
  // 枚举所有有 task_id 的通知类型
  const taskNotificationTypes = Object.entries(NOTIFICATION_TYPES)
    .filter(([, v]) => v.category === "task")
    .map(([k]) => k);

  it("task 类通知类型至少包含 task_assigned, task_completed, task_mentioned", () => {
    expect(taskNotificationTypes).toContain("task_assigned");
    expect(taskNotificationTypes).toContain("task_completed");
    expect(taskNotificationTypes).toContain("task_mentioned");
  });

  it("有 task_id 的通知不应渲染为 <a> 链接", async () => {
    // 动态引入以获取实现后的组件
    const { NotificationItem } = await import("@/components/NotificationItem");

    const n = makeNotification({ type: "task_assigned", task_id: "t-1" });
    const { container } = render(
      <NotificationItem notification={n} />
    );

    // 不应有 <a> 标签（不跳转）
    const link = container.querySelector("a");
    expect(link).toBeNull();
  });

  it("有 task_id 的通知应渲染为可点击的 button 元素", async () => {
    const { NotificationItem } = await import("@/components/NotificationItem");

    const n = makeNotification({ type: "task_completed", task_id: "t-2" });
    const { container } = render(
      <NotificationItem notification={n} />
    );

    // 应存在 button 或可点击的非链接元素
    const clickable = container.querySelector("button") || container.querySelector("[role='button']");
    expect(clickable).not.toBeNull();
  });

  it("点击有 task_id 的通知时应触发 onOpenDetail 回调", async () => {
    const user = userEvent.setup();
    const { NotificationItem } = await import("@/components/NotificationItem");

    const onOpenDetail = vi.fn();
    const n = makeNotification({ type: "task_assigned", task_id: "t-1" });
    const { container } = render(
      <NotificationItem notification={n} onOpenDetail={onOpenDetail} />
    );

    const clickable = container.querySelector("button") || container.querySelector("[role='button']") || container.firstElementChild;
    expect(clickable).not.toBeNull();
    await user.click(clickable!);

    expect(onOpenDetail).toHaveBeenCalledWith(n);
  });

  it("点击有 task_id 的通知时应触发 onClick 回调（标记已读）", async () => {
    const user = userEvent.setup();
    const { NotificationItem } = await import("@/components/NotificationItem");

    const onClick = vi.fn();
    const n = makeNotification({ type: "task_assigned", task_id: "t-1", read: false });
    const { container } = render(
      <NotificationItem notification={n} onClick={onClick} />
    );

    const clickable = container.querySelector("button") || container.querySelector("[role='button']") || container.firstElementChild;
    await user.click(clickable!);

    expect(onClick).toHaveBeenCalledWith(n);
  });
});

// ── AC-2: 每日摘要通知也改为抽屉展示 ───────────────────────────────────────────

describe("AC-2: daily_digest 通知点击不跳转，打开抽屉", () => {
  it("daily_digest 通知不应渲染为 <a> 链接", async () => {
    const { NotificationItem } = await import("@/components/NotificationItem");

    const n = makeNotification({
      type: "daily_digest",
      title: "今日摘要",
      body: "你有 3 个任务待办",
      task_id: undefined,
      space_id: undefined,
    });
    const { container } = render(
      <NotificationItem notification={n} />
    );

    const link = container.querySelector("a");
    expect(link).toBeNull();
  });

  it("daily_digest 通知应渲染为可点击的非链接元素", async () => {
    const { NotificationItem } = await import("@/components/NotificationItem");

    const n = makeNotification({
      type: "daily_digest",
      title: "今日摘要",
      task_id: undefined,
      space_id: undefined,
    });
    const { container } = render(
      <NotificationItem notification={n} />
    );

    const clickable = container.querySelector("button") || container.querySelector("[role='button']");
    expect(clickable).not.toBeNull();
  });

  it("点击 daily_digest 通知时触发 onOpenDetail 回调", async () => {
    const user = userEvent.setup();
    const { NotificationItem } = await import("@/components/NotificationItem");

    const onOpenDetail = vi.fn();
    const n = makeNotification({
      type: "daily_digest",
      title: "今日摘要",
      task_id: undefined,
      space_id: undefined,
    });
    const { container } = render(
      <NotificationItem notification={n} onOpenDetail={onOpenDetail} />
    );

    const clickable = container.querySelector("button") || container.querySelector("[role='button']") || container.firstElementChild;
    await user.click(clickable!);

    expect(onOpenDetail).toHaveBeenCalledWith(n);
  });
});

// ── AC-3: 其他通知（无 task_id 且非 daily_digest）保留链接跳转 ────────────────

describe("AC-3: 非任务且非摘要通知保留链接跳转", () => {
  const nonTaskNonDigestTypes = [
    "space_join_pending",
    "space_member_approved",
    "space_member_removed",
    "org_join_pending",
    "org_member_approved",
    "org_member_removed",
  ];

  for (const type of nonTaskNonDigestTypes) {
    it(`${type} 通知（无 task_id）应渲染为 <a> 链接`, async () => {
      const { NotificationItem } = await import("@/components/NotificationItem");

      const n = makeNotification({
        type,
        title: `${type} notification`,
        task_id: undefined,
        space_id: "s-1",
      });
      const { container } = render(
        <NotificationItem notification={n} />
      );

      const link = container.querySelector("a");
      expect(link).not.toBeNull();
      // 链接应指向正确的 URL
      expect(link!.getAttribute("href")).toBe(getNotificationUrl(n));
    });
  }

  it("space_join_pending 通知点击后应触发 onClick 回调", async () => {
    const user = userEvent.setup();
    const { NotificationItem } = await import("@/components/NotificationItem");

    const onClick = vi.fn();
    const n = makeNotification({
      type: "space_join_pending",
      title: "有人申请加入空间",
      task_id: undefined,
      space_id: "s-1",
    });
    const { container } = render(
      <NotificationItem notification={n} onClick={onClick} />
    );

    const link = container.querySelector("a")!;
    await user.click(link);
    expect(onClick).toHaveBeenCalledWith(n);
  });
});

// ── AC-4: getNotificationUrl 回归保护 ──────────────────────────────────────────

describe("AC-4: getNotificationUrl 行为不变（回归保护）", () => {
  it("space_id + task_id → /spaces/{space_id}?focus={task_id}", () => {
    expect(getNotificationUrl({ space_id: "s1", task_id: "t1" })).toBe("/spaces/s1?focus=t1");
  });

  it("仅 space_id → /spaces/{space_id}", () => {
    expect(getNotificationUrl({ space_id: "s1" })).toBe("/spaces/s1");
  });

  it("仅 task_id → /?focus={task_id}", () => {
    expect(getNotificationUrl({ task_id: "t1" })).toBe("/?focus=t1");
  });

  it("两者均无 → /", () => {
    expect(getNotificationUrl({})).toBe("/");
  });
});

// ── AC-5: GET /api/tasks/[id] 新增 handler ─────────────────────────────────────

// Helper: set up mocks for the route module, returning a fresh dynamic import
function setupRouteMocks(overrides: {
  getUserFromRequest?: () => unknown;
  getTaskForUser?: () => unknown;
}) {
  vi.resetModules();

  vi.doMock("@/lib/auth", () => ({
    getUserFromRequest: vi.fn().mockImplementation(
      overrides.getUserFromRequest ?? (() => Promise.resolve(null))
    ),
  }));
  vi.doMock("@/lib/db", () => ({
    initDb: vi.fn(),
    getTaskForUser: vi.fn().mockImplementation(
      overrides.getTaskForUser ?? (() => Promise.resolve(null))
    ),
    completeTask: vi.fn(),
    reopenTask: vi.fn(),
    deleteTask: vi.fn(),
    updateTask: vi.fn(),
    pinTask: vi.fn(),
    unpinTask: vi.fn(),
    setShareCode: vi.fn(),
    generateShareCode: vi.fn(),
    TaskValidationError: class extends Error {},
  }));
  vi.doMock("@/lib/notifications", () => ({
    fireNotification: vi.fn(),
    fireNotifications: vi.fn(),
  }));
  vi.doMock("@/lib/ai-flow-log", () => ({
    aiFlowLog: vi.fn(),
    getAiTraceIdFromHeaders: vi.fn().mockReturnValue(null),
  }));
  vi.doMock("@vercel/postgres", () => ({
    sql: Object.assign(vi.fn(), { query: vi.fn() }),
  }));
  vi.doMock("@/lib/route-timing", () => ({
    createRouteTimer: () => ({
      track: (_label: string, fn: () => unknown) => fn(),
      json: (data: unknown, init?: { status?: number }) => {
        return new Response(JSON.stringify(data), {
          status: init?.status ?? 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      empty: (status: number) => new Response(null, { status }),
    }),
  }));
  vi.doMock("@/lib/task-permissions", () => ({
    TaskPermissionError: class extends Error {},
  }));
}

describe("AC-5: GET /api/tasks/[id] 接口行为", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("模块导出包含 GET handler", async () => {
    setupRouteMocks({});
    const routeModule = await import("@/app/api/tasks/[id]/route");
    expect(routeModule.GET).toBeDefined();
    expect(typeof routeModule.GET).toBe("function");
  });

  it("未认证请求应返回 401", async () => {
    setupRouteMocks({
      getUserFromRequest: () => Promise.resolve(null),
    });

    const { GET } = await import("@/app/api/tasks/[id]/route");

    const req = new Request("http://localhost/api/tasks/test-id", { method: "GET" });
    const res = await GET(req as any, { params: Promise.resolve({ id: "test-id" }) });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("任务不存在应返回 404", async () => {
    setupRouteMocks({
      getUserFromRequest: () => Promise.resolve({ id: "u1", email: "test@test.com" }),
      getTaskForUser: () => Promise.resolve(null),
    });

    const { GET } = await import("@/app/api/tasks/[id]/route");

    const req = new Request("http://localhost/api/tasks/nonexistent-id", { method: "GET" });
    const res = await GET(req as any, { params: Promise.resolve({ id: "nonexistent-id" }) });
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("正常请求应返回 200 和任务对象", async () => {
    const mockTask = {
      id: "t-1",
      user_id: "u1",
      title: "测试任务",
      priority: 2,
      status: 0,
      tags: [],
      sort_order: 0,
      created_at: new Date().toISOString(),
      progress: 0,
    };

    setupRouteMocks({
      getUserFromRequest: () => Promise.resolve({ id: "u1", email: "test@test.com" }),
      getTaskForUser: () => Promise.resolve(mockTask),
    });

    const { GET } = await import("@/app/api/tasks/[id]/route");

    const req = new Request("http://localhost/api/tasks/t-1", { method: "GET" });
    const res = await GET(req as any, { params: Promise.resolve({ id: "t-1" }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.id).toBe("t-1");
    expect(body.title).toBe("测试任务");
  });
});

// ── AC-6: NotificationItem 基础渲染保持正常 ─────────────────────────────────────

describe("AC-6: NotificationItem 基础功能保持不变", () => {
  it("仍然显示通知标题和正文", async () => {
    const { NotificationItem } = await import("@/components/NotificationItem");

    const n = makeNotification({ title: "测试标题", body: "测试正文" });
    const { container } = render(
      <NotificationItem notification={n} />
    );

    expect(within(container).getByText("测试标题")).toBeInTheDocument();
    expect(within(container).getByText("测试正文")).toBeInTheDocument();
  });

  it("仍然显示未读小圆点", async () => {
    const { NotificationItem } = await import("@/components/NotificationItem");

    const n = makeNotification({ read: false });
    const { container } = render(
      <NotificationItem notification={n} />
    );

    const dot = container.querySelector(".bg-info.rounded-full");
    expect(dot).toBeInTheDocument();
  });

  it("已读通知不显示未读小圆点", async () => {
    const { NotificationItem } = await import("@/components/NotificationItem");

    const n = makeNotification({ read: true });
    const { container } = render(
      <NotificationItem notification={n} />
    );

    const dot = container.querySelector(".bg-info.rounded-full");
    expect(dot).not.toBeInTheDocument();
  });

  it("仍然显示类型图标", async () => {
    const { NotificationItem } = await import("@/components/NotificationItem");

    const n = makeNotification({ type: "task_assigned" });
    const { container } = render(
      <NotificationItem notification={n} />
    );

    expect(within(container).getByText("📌")).toBeInTheDocument();
  });

  it("仍然显示相对时间", async () => {
    const { NotificationItem } = await import("@/components/NotificationItem");

    const n = makeNotification({ created_at: new Date().toISOString() });
    const { container } = render(
      <NotificationItem notification={n} />
    );

    expect(within(container).getByText("刚刚")).toBeInTheDocument();
  });
});
