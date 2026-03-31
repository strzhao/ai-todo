// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskDetail } from "@/components/TaskDetail";
import { MILESTONE_PRESETS } from "@/lib/milestone-utils";
import type { Task } from "@/lib/types";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    user_id: "user-1",
    title: "发布 v1.0",
    description: "整理发布说明",
    priority: 2,
    status: 0,
    tags: ["发布"],
    sort_order: 0,
    created_at: "2026-03-24T10:00:00Z",
    progress: 40,
    type: 0,
    ...overrides,
  };
}

const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

  if (url.includes("/logs") && (!init?.method || init.method === "GET")) {
    return Promise.resolve({ ok: true, json: async () => [] } as Response);
  }

  if (url.includes("/members")) {
    return Promise.resolve({ ok: true, json: async () => [] } as Response);
  }

  return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
});

vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("TaskDetail 抽屉交互", () => {
  it("展示和任务列表一致的里程碑默认值，并支持一键应用", async () => {
    const user = userEvent.setup();

    render(
      <TaskDetail
        task={makeTask()}
        onUpdate={vi.fn()}
        onComplete={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText("默认值")).toBeInTheDocument();
    for (const preset of MILESTONE_PRESETS) {
      expect(screen.getByRole("button", { name: preset })).toBeInTheDocument();
    }

    await user.click(screen.getByRole("button", { name: "版本发布" }));

    await waitFor(() => {
      const milestonePatched = fetchMock.mock.calls.some((call) => {
        const init = call[1] as RequestInit | undefined;
        if (init?.method !== "PATCH" || typeof init.body !== "string") return false;
        return JSON.parse(init.body).milestone === "版本发布";
      });
      expect(milestonePatched).toBe(true);
    });
  });

  it("完成动作改为状态迁移入口，并在确认框里再次说明自动保存", async () => {
    const user = userEvent.setup();

    render(
      <TaskDetail
        task={makeTask()}
        onUpdate={vi.fn()}
        onComplete={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "标记完成" })).toBeNull();
    expect(screen.getByText("任务状态")).toBeInTheDocument();
    expect(screen.getByText("修改会自动保存")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "移到已完成" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("将任务移到已完成？")).toBeInTheDocument();
    expect(within(dialog).getByText(/当前修改已自动保存/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "移到已完成" }));

    await waitFor(() => {
      const completedPatched = fetchMock.mock.calls.some((call) => {
        const init = call[1] as RequestInit | undefined;
        if (init?.method !== "PATCH" || typeof init.body !== "string") return false;
        return JSON.parse(init.body).complete === true;
      });
      expect(completedPatched).toBe(true);
    });
  });
});
