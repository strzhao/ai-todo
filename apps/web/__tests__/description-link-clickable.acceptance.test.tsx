// @vitest-environment jsdom
/**
 * 验收测试（红队）：任务描述中的 URL 可点击
 *
 * 设计文档（验收依据，期望值全部来自设计文档，独立于实现）：
 * - Fix1：TaskItem 描述容器 class 保留 `md:pointer-events-none`，追加
 *   `md:[&_a]:pointer-events-auto`（容器桌面端整体仍无指针事件，仅容器内 <a> 恢复可点）
 * - Fix2：TaskDetail 描述区 view/edit 双态：
 *   非 readonly 默认视图态用 RichText 渲染（链接可点）；点击描述容器进入编辑态（textarea，
 *   autoFocus）；onBlur 保存并回到视图态；readonly（已完成）行为不变（RichText /「无描述」）
 *
 * 预注册验收谓词：
 * - P1：TaskItem 描述容器 className 同时含 `md:pointer-events-none` 与
 *   `md:[&_a]:pointer-events-auto`，且 DOM 存在 href 为完整 URL 的 <a>
 * - P2：TaskDetail 非 readonly：初始存在完整 URL 的 <a>；点击描述容器后出现 textarea
 *   且 <a> 消失；textarea blur 后更新回调（onUpdate）被调用且 <a> 恢复
 * - P3：TaskDetail readonly + 描述含 URL → <a> 存在（回归保护）
 * - P4：移动端（matchMedia <768px）TaskItem：点击描述行非链接区域 → 展开 embedded
 *   TaskDetail（「进展更新」可见）；点击链接 → 不触发展开
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskItem } from "@/components/TaskItem";
import { TaskDetail } from "@/components/TaskDetail";
import type { Task } from "@/lib/types";

// ── 被测 URL（谓词指定）───────────────────────────────────────────────────────

const TASK_URL =
  "https://skynet.hz.netease.com/manage?dimensionType=2&time=1782835200000&bizType=52";
const DESCRIPTION = `查看后台数据 ${TASK_URL} 并核对指标`;

// ── Global mocks ──────────────────────────────────────────────────────────────

const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

  if (url.includes("/logs") && (!init?.method || init.method === "GET")) {
    return Promise.resolve({ ok: true, json: async () => [] } as Response);
  }
  if (url.includes("/members")) {
    return Promise.resolve({ ok: true, json: async () => [] } as Response);
  }
  return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
});
vi.stubGlobal("fetch", fetchMock);

// jsdom 无 matchMedia；这里统一 mock 为 <768px 移动端（P4 的前置条件）。
// 桌面端 Tailwind md: 前缀类在 jsdom 中不参与布局，断言只看 class 字符串本身。
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

// RichText 的 LinkChip 会在 useEffect 中 fetchUrlMeta，mock 掉保持 hermetic
vi.mock("@/lib/url-meta-cache", () => ({
  fetchUrlMeta: vi.fn(() => Promise.resolve({ title: null })),
}));

beforeEach(() => {
  fetchMock.mockClear();
});

afterEach(() => {
  cleanup();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    user_id: "user-1",
    title: "带链接的任务",
    description: DESCRIPTION,
    priority: 2,
    status: 0,
    tags: [],
    sort_order: 0,
    created_at: "2026-08-28T10:00:00Z",
    progress: 0,
    type: 0,
    ...overrides,
  };
}

// 注意：不要用 `a[href="${TASK_URL}"]` 属性选择器 —— jsdom（nwsapi）对含原始 &/? 的
// 属性值匹配不可靠；改为遍历 <a> 逐个比对 getAttribute("href")。
function getDescLink(container: HTMLElement | Document): HTMLAnchorElement | null {
  return (
    Array.from(container.querySelectorAll("a")).find((a) => a.getAttribute("href") === TASK_URL) ??
    null
  );
}

/** 从 el 向上找第一个 className 含 fragment 的祖先（描述容器定位，不依赖具体结构） */
function findAncestorWithClassFragment(el: Element, fragment: string): HTMLElement | null {
  let cur: Element | null = el.parentElement;
  while (cur) {
    if (typeof cur.className === "string" && cur.className.includes(fragment)) {
      return cur as HTMLElement;
    }
    cur = cur.parentElement;
  }
  return null;
}

function countLogsFetchCalls(): number {
  return fetchMock.mock.calls.filter((call) => String(call[0]).includes("/logs")).length;
}

// ── 验收谓词 ──────────────────────────────────────────────────────────────────

describe("任务描述 URL 可点击（验收）", () => {
  it("P1: TaskItem 描述容器保留 md:pointer-events-none 且追加 md:[&_a]:pointer-events-auto，DOM 存在完整 URL 链接", () => {
    const { container } = render(
      <TaskItem task={makeTask()} onComplete={vi.fn()} onDelete={vi.fn()} onUpdate={vi.fn()} />
    );

    const link = getDescLink(container);
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe(TASK_URL);

    const descContainer = findAncestorWithClassFragment(link!, "md:[&_a]:pointer-events-auto");
    expect(descContainer).not.toBeNull();
    // 同一容器上两个 class 并存：整体桌面端仍禁用指针事件，仅容器内 <a> 恢复
    expect(descContainer!.className).toContain("md:pointer-events-none");
    expect(descContainer!.className).toContain("md:[&_a]:pointer-events-auto");
    expect(descContainer!.contains(link!)).toBe(true);
  });

  it("P2: TaskDetail 非 readonly 描述默认视图态链接可点，点击进入编辑态（textarea，链接消失），blur 保存并回到视图态", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();

    const { container } = render(
      <TaskDetail task={makeTask()} onUpdate={onUpdate} onComplete={vi.fn()} onDelete={vi.fn()} />
    );

    // 初始视图态：完整 URL 链接存在
    expect(getDescLink(container)).not.toBeNull();

    // 点击描述容器（点击链接外的文本节点，事件冒泡到容器）
    const richTextSpan = getDescLink(container)!.parentElement as HTMLElement;
    await user.click(richTextSpan);

    // 编辑态：出现描述 textarea（以 value 含被测 URL 识别，与日志 textarea 区分），链接消失
    const textarea = await waitFor(() => {
      const ta = Array.from(container.querySelectorAll("textarea")).find((el) =>
        el.value.includes(TASK_URL)
      );
      expect(ta).toBeDefined();
      return ta!;
    });
    expect(getDescLink(container)).toBeNull();

    // 修改内容后 blur → 保存 + 回到视图态
    await user.clear(textarea);
    await user.type(textarea, `${TASK_URL} 补充说明`);
    fireEvent.blur(textarea);

    await waitFor(() => {
      expect(onUpdate.mock.calls.length).toBeGreaterThan(0);
    });
    // 视图态恢复：<a> 回来了
    await waitFor(() => {
      expect(getDescLink(container)).not.toBeNull();
    });
  });

  it("P3: TaskDetail readonly（已完成）描述中 URL 仍渲染为链接（回归保护）", () => {
    const { container } = render(
      <TaskDetail
        task={makeTask({ status: 2 })}
        readonly
        onUpdate={vi.fn()}
        onComplete={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const link = getDescLink(container);
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe(TASK_URL);
  });

  it("P4 正向: 移动端 TaskItem 点击描述行非链接文本区域 → 展开 embedded TaskDetail（进展更新 可见）", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TaskItem task={makeTask()} onComplete={vi.fn()} onDelete={vi.fn()} onUpdate={vi.fn()} />
    );

    const link = getDescLink(container);
    expect(link).not.toBeNull();

    // 点击描述行上的非链接区域（描述容器本身；fallback 到链接父级文本 span）
    const clickTarget =
      findAncestorWithClassFragment(link!, "md:[&_a]:pointer-events-auto") ??
      (link!.parentElement as HTMLElement);
    await user.click(clickTarget);

    // embedded TaskDetail 出现：进展更新 区块可见
    expect(await screen.findByText("进展更新", {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it("P4 负向: 移动端 TaskItem 点击描述中的链接 → 不触发展开（链接 stopPropagation）", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TaskItem task={makeTask()} onComplete={vi.fn()} onDelete={vi.fn()} onUpdate={vi.fn()} />
    );

    const link = getDescLink(container);
    expect(link).not.toBeNull();

    const logsCallsBefore = countLogsFetchCalls();
    await user.click(link!);

    // 留出异步展开的窗口，确认详情没有展开（无「进展更新」，也无 logs 请求）
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByText("进展更新")).not.toBeInTheDocument();
    expect(countLogsFetchCalls()).toBe(logsCallsBefore);
  });
});
