// @vitest-environment jsdom
/**
 * TaskDetail 描述保存失败可见化（saveDescription 错误分支）
 *
 * 行为约定：
 * - PATCH 失败（HTTP 非 2xx / 网络异常）→ 视图态显示内联错误提示（text-destructive），
 *   保留本地未保存文本（不回滚、不丢失），onUpdate 不触发
 * - 点击描述重新进入编辑 → 错误清除；再次 blur 保存成功 → 错误不出现，onUpdate 触发
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskDetail } from "@/components/TaskDetail";
import type { Task } from "@/lib/types";

const DESC = "原始描述内容";

// PATCH 结果可控（测试内切换成功/失败）
let patchFailWith: { status: number } | "network" | null = null;

const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const method = init?.method ?? "GET";

  if (url.includes("/logs") && method === "GET") {
    return Promise.resolve({ ok: true, json: async () => [] } as Response);
  }
  if (url.includes("/members")) {
    return Promise.resolve({ ok: true, json: async () => [] } as Response);
  }
  if (url.includes("/api/tasks/") && method === "PATCH") {
    if (patchFailWith === "network") return Promise.reject(new Error("network down"));
    if (patchFailWith) {
      return Promise.resolve({ ok: false, status: patchFailWith.status } as Response);
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response);
  }
  return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
});
vi.stubGlobal("fetch", fetchMock);

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
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

vi.mock("@/lib/url-meta-cache", () => ({
  fetchUrlMeta: vi.fn(() => Promise.resolve({ title: null })),
}));

function makeTask(): Task {
  return {
    id: "task-1",
    user_id: "user-1",
    title: "测试任务",
    description: DESC,
    priority: 2,
    status: 0,
    tags: [],
    sort_order: 0,
    created_at: "2026-08-28T10:00:00Z",
    progress: 0,
    type: 0,
  };
}

/** 进入编辑态：点击视图态容器（以 title 定位），返回描述 textarea（以 value 含 DESC 区分） */
async function enterDescEdit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTitle("点击编辑描述"));
  return waitFor(() => {
    const ta = screen
      .getAllByRole("textbox")
      .find((el) => (el as HTMLTextAreaElement).value.includes(DESC));
    expect(ta).toBeDefined();
    return ta as HTMLTextAreaElement;
  });
}

beforeEach(() => {
  patchFailWith = null;
  fetchMock.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("TaskDetail 描述保存失败可见化", () => {
  it("PATCH 500 → 显示内联错误，保留未保存文本，onUpdate 不触发", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const { container } = render(
      <TaskDetail task={makeTask()} onUpdate={onUpdate} onComplete={vi.fn()} onDelete={vi.fn()} />
    );

    const ta = await enterDescEdit(user);
    await user.clear(ta);
    await user.type(ta, "改后的描述 987");
    patchFailWith = { status: 500 };
    fireEvent.blur(ta);

    // 视图态回来 + 错误提示出现
    expect(await screen.findByText(/描述保存失败（500）/)).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
    // 未保存文本仍在视图态可见（不回滚丢失）
    expect(container.textContent).toContain("改后的描述 987");
  });

  it("重新进入编辑错误清除，重试成功后不再出现错误且 onUpdate 触发", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <TaskDetail task={makeTask()} onUpdate={onUpdate} onComplete={vi.fn()} onDelete={vi.fn()} />
    );

    const ta = await enterDescEdit(user);
    await user.clear(ta);
    await user.type(ta, "第一次修改");
    patchFailWith = { status: 500 };
    fireEvent.blur(ta);
    expect(await screen.findByText(/描述保存失败（500）/)).toBeInTheDocument();

    // 重新点击描述 → 进入编辑，错误应消失
    await user.click(screen.getByTitle("点击编辑描述"));
    await waitFor(() => {
      expect(screen.queryByText(/描述保存失败/)).not.toBeInTheDocument();
    });

    // 这次保存成功
    patchFailWith = null;
    const ta2 = await waitFor(() => {
      const el = screen
        .getAllByRole("textbox")
        .find((t) => (t as HTMLTextAreaElement).value.includes("第一次修改"));
      expect(el).toBeDefined();
      return el as HTMLTextAreaElement;
    });
    fireEvent.blur(ta2);

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledTimes(1);
    });
    // 成功后无错误提示
    await waitFor(() => {
      expect(screen.queryByText(/描述保存失败/)).not.toBeInTheDocument();
    });
  });

  it("网络异常（fetch reject）→ 同样显示错误提示", async () => {
    const user = userEvent.setup();
    render(
      <TaskDetail task={makeTask()} onUpdate={vi.fn()} onComplete={vi.fn()} onDelete={vi.fn()} />
    );

    const ta = await enterDescEdit(user);
    await user.clear(ta);
    await user.type(ta, "网络失败场景");
    patchFailWith = "network";
    fireEvent.blur(ta);

    expect(await screen.findByText(/描述保存失败（网络错误）/)).toBeInTheDocument();
  });
});
