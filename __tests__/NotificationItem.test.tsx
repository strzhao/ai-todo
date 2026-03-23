// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationItem } from "@/components/NotificationItem";
import type { AppNotification } from "@/lib/types";

afterEach(cleanup);

// Mock next/link to render a plain anchor
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

describe("NotificationItem", () => {
  it("renders notification title and body", () => {
    const { container } = render(<NotificationItem notification={makeNotification()} />);
    expect(within(container).getByText("你被指派了新任务")).toBeInTheDocument();
    expect(within(container).getByText("写周报")).toBeInTheDocument();
  });

  it("renders type icon for task_assigned", () => {
    const { container } = render(
      <NotificationItem notification={makeNotification({ type: "task_assigned" })} />
    );
    expect(within(container).getByText("📌")).toBeInTheDocument();
  });

  it("renders type icon for task_completed", () => {
    const { container } = render(
      <NotificationItem notification={makeNotification({ type: "task_completed" })} />
    );
    expect(within(container).getByText("✅")).toBeInTheDocument();
  });

  it("shows unread dot when read is false", () => {
    const { container } = render(
      <NotificationItem notification={makeNotification({ read: false })} />
    );
    const dot = container.querySelector(".bg-info.rounded-full");
    expect(dot).toBeInTheDocument();
  });

  it("hides unread dot when read is true", () => {
    const { container } = render(
      <NotificationItem notification={makeNotification({ read: true })} />
    );
    const dot = container.querySelector(".bg-info.rounded-full");
    expect(dot).not.toBeInTheDocument();
  });

  it("applies opacity class when read", () => {
    const { container } = render(
      <NotificationItem notification={makeNotification({ read: true })} />
    );
    // task_id 通知现在渲染为 button
    const el = container.querySelector("button") || container.querySelector("a");
    expect(el?.className).toContain("opacity-60");
  });

  it("links to correct URL for non-task notifications", () => {
    const { container } = render(
      <NotificationItem notification={makeNotification({ space_id: "s-1", task_id: undefined, type: "space_join_pending" })} />
    );
    const link = container.querySelector("a");
    expect(link).toHaveAttribute("href", "/spaces/s-1");
  });

  it("renders as button for task notifications", () => {
    const { container } = render(
      <NotificationItem notification={makeNotification({ space_id: "s-1", task_id: "t-1" })} />
    );
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const n = makeNotification();
    const { container } = render(<NotificationItem notification={n} onClick={onClick} />);

    // task_id 通知渲染为 button
    const el = container.querySelector("button") || container.querySelector("a")!;
    await user.click(el!);
    expect(onClick).toHaveBeenCalledWith(n);
  });

  it("shows relative time", () => {
    const { container } = render(<NotificationItem notification={makeNotification()} />);
    expect(within(container).getByText("刚刚")).toBeInTheDocument();
  });

  it("does not render body when absent", () => {
    const { container } = render(
      <NotificationItem notification={makeNotification({ body: undefined })} />
    );
    expect(within(container).queryByText("写周报")).not.toBeInTheDocument();
  });
});
