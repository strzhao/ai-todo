// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoteCard } from "@/components/NoteCard";
import type { Task } from "@/lib/types";

afterEach(cleanup);

// Mock fetch globally
vi.stubGlobal(
  "fetch",
  vi.fn(() => Promise.resolve({ ok: true }))
);

function makeNote(overrides: Partial<Task> = {}): Task {
  return {
    id: "note-1",
    user_id: "u1",
    title: "测试笔记内容",
    priority: 2,
    status: 0,
    tags: ["工作", "重要"],
    sort_order: 0,
    created_at: "2025-01-15T10:30:00Z",
    progress: 0,
    type: 1,
    ...overrides,
  };
}

describe("NoteCard", () => {
  it("renders note title", () => {
    const { container } = render(
      <NoteCard note={makeNote()} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    expect(within(container).getByText("测试笔记内容")).toBeInTheDocument();
  });

  it("renders tags", () => {
    const { container } = render(
      <NoteCard note={makeNote()} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    expect(within(container).getByText("#工作")).toBeInTheDocument();
    expect(within(container).getByText("#重要")).toBeInTheDocument();
  });

  it("renders formatted time", () => {
    const { container } = render(
      <NoteCard note={makeNote()} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    const timeEl = within(container).getByText(/\d{2}:\d{2}/);
    expect(timeEl).toBeInTheDocument();
  });

  it("enters edit mode on click", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <NoteCard note={makeNote()} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );

    await user.click(within(container).getByText("测试笔记内容"));
    const textarea = within(container).getByRole("textbox");
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue("测试笔记内容");
  });

  it("applies highlight class when highlight prop is true", () => {
    const { container } = render(
      <NoteCard note={makeNote()} highlight onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    expect(container.firstChild).toHaveClass("animate-highlight-sage");
  });

  it("shows delete confirmation on first click", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const { container } = render(
      <NoteCard note={makeNote()} onUpdate={vi.fn()} onDelete={onDelete} />
    );

    const deleteBtn = within(container).getByTitle("删除");
    await user.click(deleteBtn);
    expect(within(container).getByText("确认?")).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("renders description with expand/collapse when long", () => {
    // New collapse logic uses scrollHeight > 120px instead of line count
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight"
    );
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() { return 200; },
    });

    const longDesc = "line1\nline2\nline3\nline4\nline5";
    const { container } = render(
      <NoteCard note={makeNote({ description: longDesc })} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    expect(within(container).getByText("展开全部")).toBeInTheDocument();

    if (originalScrollHeight) {
      Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
    }
  });
});
