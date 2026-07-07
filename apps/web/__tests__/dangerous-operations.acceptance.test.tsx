/**
 * 验收测试：危险操作确认保护
 *
 * 设计文档约定：
 * 1. TaskItem 键盘安全：Delete/Backspace 键不应触发任务删除
 * 2. TaskItem 菜单删除：点击「删除」后应弹出确认对话框，取消不删除，确认才删除
 * 3. TaskDetail 删除：点击「删除」按钮后应弹出确认对话框，取消不删除，确认才删除
 * 4. SpaceSettings 归档确认：点击「归档空间」后应弹出确认对话框，取消不归档
 * 5. SpaceSettings 移除成员确认：点击「移除」后应弹出确认对话框，取消不移除
 */

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Task, TaskMember } from "@/lib/types";

afterEach(cleanup);

// ── Global mocks ──────────────────────────────────────────────────────────────

vi.stubGlobal(
  "fetch",
  vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }))
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    user_id: "u1",
    title: "测试任务",
    priority: 2,
    status: 0,
    tags: ["工作"],
    sort_order: 0,
    created_at: "2026-03-24T10:00:00Z",
    progress: 0,
    type: 0,
    ...overrides,
  };
}

function makeSpaceTask(overrides: Partial<Task> = {}): Task {
  return makeTask({
    id: "space-1",
    title: "测试空间",
    pinned: true,
    invite_code: "abc12345",
    invite_mode: "open",
    my_role: "owner",
    ...overrides,
  });
}

function makeMember(overrides: Partial<TaskMember> = {}): TaskMember {
  return {
    id: "m-1",
    task_id: "space-1",
    user_id: "u2",
    email: "member@test.com",
    display_name: "测试成员",
    role: "member",
    status: "active",
    joined_at: "2026-03-01T00:00:00Z",
    ...overrides,
  };
}

// ── 1. TaskItem 键盘安全 ──────────────────────────────────────────────────────

describe("TaskItem 键盘安全", () => {
  it("按 Delete 键不应触发任务删除", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    const { TaskItem } = await import("@/components/TaskItem");
    const task = makeTask();

    const { container } = render(
      <TaskItem task={task} onUpdate={vi.fn()} onDelete={onDelete} onComplete={vi.fn()} />
    );

    // 聚焦任务行后按 Delete 键
    const taskRow = container.firstElementChild as HTMLElement;
    taskRow.focus();
    await user.keyboard("{Delete}");

    // 不应触发删除
    expect(onDelete).not.toHaveBeenCalled();
    // fetch 不应被调用（无删除请求）
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/tasks/task-1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("按 Backspace 键不应触发任务删除", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    const { TaskItem } = await import("@/components/TaskItem");
    const task = makeTask();

    const { container } = render(
      <TaskItem task={task} onUpdate={vi.fn()} onDelete={onDelete} onComplete={vi.fn()} />
    );

    // 聚焦任务行后按 Backspace 键
    const taskRow = container.firstElementChild as HTMLElement;
    taskRow.focus();
    await user.keyboard("{Backspace}");

    // 不应触发删除
    expect(onDelete).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/tasks/task-1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

// ── 2. TaskItem 菜单删除确认 ──────────────────────────────────────────────────

describe("TaskItem 菜单删除确认", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockClear();
  });

  it("点击菜单中的「删除」应弹出确认对话框", async () => {
    const user = userEvent.setup();
    const { TaskItem } = await import("@/components/TaskItem");
    const task = makeTask();

    render(<TaskItem task={task} onUpdate={vi.fn()} onDelete={vi.fn()} onComplete={vi.fn()} />);

    // 打开更多菜单（⋮ 按钮）
    const moreButton =
      screen.getByRole("button", { name: /更多|操作|菜单/i }) ||
      document.querySelector("[aria-label*='更多']") ||
      document.querySelector("button[data-testid='task-menu']");

    if (moreButton) {
      await user.click(moreButton);
    }

    // 找到删除选项并点击
    const deleteOption = await screen.findByText(/删除/);
    await user.click(deleteOption);

    // 应弹出确认对话框（包含确认相关文字）
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeNull();
    });
  });

  it("确认对话框中点击取消不应删除任务", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const { TaskItem } = await import("@/components/TaskItem");
    const task = makeTask();

    render(<TaskItem task={task} onUpdate={vi.fn()} onDelete={onDelete} onComplete={vi.fn()} />);

    // 打开菜单 → 点击删除
    const moreButton =
      screen.getByRole("button", { name: /更多|操作|菜单/i }) ||
      document.querySelector("[aria-label*='更多']") ||
      document.querySelector("button[data-testid='task-menu']");
    if (moreButton) await user.click(moreButton);

    const deleteOption = await screen.findByText(/删除/);
    await user.click(deleteOption);

    // 等待确认对话框出现，然后点击取消
    await waitFor(async () => {
      const cancelButton =
        screen.queryByText(/取消/) || screen.queryByRole("button", { name: /取消|cancel/i });
      expect(cancelButton).not.toBeNull();
      await user.click(cancelButton!);
    });

    // 任务不应被删除
    expect(onDelete).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/tasks/task-1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("确认对话框中点击确认应执行删除", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const { TaskItem } = await import("@/components/TaskItem");
    const task = makeTask();

    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }) as Response);

    render(<TaskItem task={task} onUpdate={vi.fn()} onDelete={onDelete} onComplete={vi.fn()} />);

    // 打开菜单 → 点击删除
    const moreButton =
      screen.getByRole("button", { name: /更多|操作|菜单/i }) ||
      document.querySelector("[aria-label*='更多']") ||
      document.querySelector("button[data-testid='task-menu']");
    if (moreButton) await user.click(moreButton);

    const deleteOption = await screen.findByText(/删除/);
    await user.click(deleteOption);

    // 等待确认对话框出现，然后点击确认按钮
    const dialog = await screen.findByRole("alertdialog");
    const confirmButton = within(dialog).getByRole("button", { name: /确认删除/ });
    await user.click(confirmButton);

    // 确认后应触发删除（通过 onDelete 回调或 fetch DELETE 请求）
    await waitFor(() => {
      const deleteCalled = onDelete.mock.calls.length > 0;
      const fetchDeleteCalled = vi.mocked(fetch).mock.calls.some((call) => {
        const url = typeof call[0] === "string" ? call[0] : (call[0] as Request).url;
        const opts = call[1] as RequestInit | undefined;
        return url.includes("/api/tasks/task-1") && opts?.method === "DELETE";
      });
      expect(deleteCalled || fetchDeleteCalled).toBe(true);
    });
  });
});

// ── 3. TaskDetail 删除确认 ─────────────────────────────────────────────────────

describe("TaskDetail 删除确认", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockClear();
  });

  it("点击删除按钮应弹出确认对话框", async () => {
    const user = userEvent.setup();
    const { TaskDetail } = await import("@/components/TaskDetail");
    const task = makeTask();

    render(<TaskDetail task={task} onUpdate={vi.fn()} onDelete={vi.fn()} onComplete={vi.fn()} />);

    // 找到删除按钮并点击
    const deleteButton =
      screen.getByRole("button", { name: /删除/ }) || screen.getByText(/删除任务|删除/);
    await user.click(deleteButton);

    // 应弹出确认对话框
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeNull();
    });
  });

  it("确认对话框中点击取消不应删除任务", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const { TaskDetail } = await import("@/components/TaskDetail");
    const task = makeTask();

    render(<TaskDetail task={task} onUpdate={vi.fn()} onDelete={onDelete} onComplete={vi.fn()} />);

    // 点击删除
    const deleteButton =
      screen.getByRole("button", { name: /删除/ }) || screen.getByText(/删除任务|删除/);
    await user.click(deleteButton);

    // 点击取消
    await waitFor(async () => {
      const cancelButton =
        screen.queryByText(/取消/) || screen.queryByRole("button", { name: /取消|cancel/i });
      expect(cancelButton).not.toBeNull();
      await user.click(cancelButton!);
    });

    // 不应删除
    expect(onDelete).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/tasks/task-1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("确认对话框中点击确认应执行删除", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const { TaskDetail } = await import("@/components/TaskDetail");
    const task = makeTask();

    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }) as Response);

    render(<TaskDetail task={task} onUpdate={vi.fn()} onDelete={onDelete} onComplete={vi.fn()} />);

    // 点击删除
    const deleteButton =
      screen.getByRole("button", { name: /删除/ }) || screen.getByText(/删除任务|删除/);
    await user.click(deleteButton);

    // 点击确认
    const dialog2 = await screen.findByRole("alertdialog");
    const confirmBtn = within(dialog2).getByRole("button", { name: /确认删除/ });
    await user.click(confirmBtn);

    // 应执行删除
    await waitFor(() => {
      const deleteCalled = onDelete.mock.calls.length > 0;
      const fetchDeleteCalled = vi.mocked(fetch).mock.calls.some((call) => {
        const url = typeof call[0] === "string" ? call[0] : (call[0] as Request).url;
        const opts = call[1] as RequestInit | undefined;
        return url.includes("/api/tasks/task-1") && opts?.method === "DELETE";
      });
      expect(deleteCalled || fetchDeleteCalled).toBe(true);
    });
  });
});

// ── 4. SpaceSettings 归档确认 ──────────────────────────────────────────────────

describe("SpaceSettings 归档确认", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockClear();
    // SpaceSettings 内部 fetch /api/spaces/{id} 和 /api/orgs
    vi.mocked(fetch).mockImplementation((url) => {
      const urlStr = typeof url === "string" ? url : (url as Request).url;
      if (urlStr.includes("/api/spaces/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              space: {
                id: "space-1",
                title: "测试空间",
                pinned: true,
                invite_code: "abc12345",
                invite_mode: "open",
                my_user_id: "u1",
                user_id: "u1",
                my_role: "owner",
              },
              members: [
                {
                  user_id: "u1",
                  email: "owner@test.com",
                  role: "owner",
                  status: "active",
                  display_name: "Owner",
                },
              ],
            }),
        } as Response);
      }
      if (urlStr.includes("/api/orgs")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });
  });

  it("点击「归档空间」应弹出确认对话框", async () => {
    const user = userEvent.setup();
    const { SpaceSettings } = await import("@/components/SpaceSettings");

    render(<SpaceSettings spaceId="space-1" />);

    // 等待组件加载完成
    await waitFor(() => {
      expect(screen.queryByText("加载中...")).toBeNull();
    });

    // 找到归档按钮并点击
    const archiveButton = screen.getByRole("button", { name: /归档/ });
    await user.click(archiveButton);

    // 应弹出确认对话框
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeNull();
    });
  });

  it("确认对话框中点击取消不应归档", async () => {
    const user = userEvent.setup();
    const { SpaceSettings } = await import("@/components/SpaceSettings");

    render(<SpaceSettings spaceId="space-1" />);

    await waitFor(() => {
      expect(screen.queryByText("加载中...")).toBeNull();
    });

    // 点击归档
    const archiveButton = screen.getByRole("button", { name: /归档/ });
    await user.click(archiveButton);

    // 点击取消
    await waitFor(async () => {
      const cancelButton = screen.queryByText(/取消/);
      expect(cancelButton).not.toBeNull();
      await user.click(cancelButton!);
    });

    // 不应发出归档请求（PATCH）
    const archiveFetchCalls = vi.mocked(fetch).mock.calls.filter((call) => {
      const urlStr = typeof call[0] === "string" ? call[0] : (call[0] as Request).url;
      const opts = call[1] as RequestInit | undefined;
      return urlStr.includes("/api/spaces/space-1") && opts?.method === "PATCH";
    });
    expect(archiveFetchCalls.length).toBe(0);
  });
});

// ── 5. SpaceSettings 移除成员确认 ──────────────────────────────────────────────

describe("SpaceSettings 移除成员确认", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockClear();
    // 返回 owner + 一个普通成员
    vi.mocked(fetch).mockImplementation((url) => {
      const urlStr = typeof url === "string" ? url : (url as Request).url;
      if (urlStr.includes("/api/spaces/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              space: {
                id: "space-1",
                title: "测试空间",
                pinned: true,
                invite_code: "abc12345",
                invite_mode: "open",
                my_user_id: "u1",
                user_id: "u1",
                my_role: "owner",
              },
              members: [
                {
                  id: "m1",
                  user_id: "u1",
                  email: "owner@test.com",
                  role: "owner",
                  status: "active",
                  display_name: "Owner",
                },
                {
                  id: "m2",
                  user_id: "u2",
                  email: "member@test.com",
                  role: "member",
                  status: "active",
                  display_name: "测试成员",
                },
              ],
            }),
        } as Response);
      }
      if (urlStr.includes("/api/orgs")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });
  });

  it("点击「移除」成员应弹出确认对话框", async () => {
    const user = userEvent.setup();
    const { SpaceSettings } = await import("@/components/SpaceSettings");

    render(<SpaceSettings spaceId="space-1" />);

    await waitFor(() => {
      expect(screen.queryByText("加载中...")).toBeNull();
    });

    // 找到移除按钮
    const removeButton = screen.getByRole("button", { name: /移除/ });
    await user.click(removeButton);

    // 应弹出确认对话框
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeNull();
    });
  });

  it("确认对话框中点击取消不应移除成员", async () => {
    const user = userEvent.setup();
    const { SpaceSettings } = await import("@/components/SpaceSettings");

    render(<SpaceSettings spaceId="space-1" />);

    await waitFor(() => {
      expect(screen.queryByText("加载中...")).toBeNull();
    });

    // 点击移除
    const removeButton = screen.getByRole("button", { name: /移除/ });
    await user.click(removeButton);

    // 点击取消
    await waitFor(async () => {
      const cancelButton = screen.queryByText(/取消/);
      expect(cancelButton).not.toBeNull();
      await user.click(cancelButton!);
    });

    // 不应发出移除成员请求
    const removeFetchCalls = vi.mocked(fetch).mock.calls.filter((call) => {
      const urlStr = typeof call[0] === "string" ? call[0] : (call[0] as Request).url;
      const opts = call[1] as RequestInit | undefined;
      return urlStr.includes("/members/") && opts?.method === "DELETE";
    });
    expect(removeFetchCalls.length).toBe(0);
  });
});
