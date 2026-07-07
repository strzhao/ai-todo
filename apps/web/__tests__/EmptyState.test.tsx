// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(cleanup);
import userEvent from "@testing-library/user-event";
import { EmptyState } from "@/components/EmptyState";

describe("EmptyState", () => {
  it("renders text and default icon", () => {
    render(<EmptyState text="没有任务" />);
    expect(screen.getByText("没有任务")).toBeInTheDocument();
    expect(screen.getByText("✓")).toBeInTheDocument();
  });

  it("renders custom icon", () => {
    render(<EmptyState text="空" icon={<span>🎉</span>} />);
    expect(screen.getByText("🎉")).toBeInTheDocument();
  });

  it("renders subtext when provided", () => {
    render(<EmptyState text="空" subtext="试试创建一个" />);
    expect(screen.getByText("试试创建一个")).toBeInTheDocument();
  });

  it("does not render subtext when not provided", () => {
    const { container } = render(<EmptyState text="空" />);
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(1);
  });

  it("renders action button and handles click", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<EmptyState text="空" action={{ label: "新建", onClick }} />);

    const button = screen.getByRole("button", { name: "新建" });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not render action button when not provided", () => {
    const { container } = render(<EmptyState text="空" />);
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(0);
  });
});
