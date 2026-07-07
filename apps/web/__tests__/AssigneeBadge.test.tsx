// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import { AssigneeBadge } from "@/components/AssigneeBadge";

afterEach(cleanup);

describe("AssigneeBadge", () => {
  it("renders nothing when isMe is true", () => {
    const { container } = render(<AssigneeBadge email="test@example.com" isMe />);
    expect(container.innerHTML).toBe("");
  });

  it("renders email local part when no display_name or nickname", () => {
    const { container } = render(<AssigneeBadge email="alice@example.com" />);
    expect(within(container).getByText("alice")).toBeInTheDocument();
    expect(within(container).getByText("A")).toBeInTheDocument();
  });

  it("prefers display_name over nickname and email", () => {
    const { container } = render(
      <AssigneeBadge email="alice@example.com" display_name="Alice Wang" nickname="小 A" />
    );
    expect(within(container).getByText("Alice Wang")).toBeInTheDocument();
    expect(within(container).getByText("A")).toBeInTheDocument();
  });

  it("uses nickname when display_name is absent", () => {
    const { container } = render(<AssigneeBadge email="bob@example.com" nickname="小 B" />);
    expect(within(container).getByText("小 B")).toBeInTheDocument();
  });

  it("shows uppercase initial", () => {
    const { container } = render(<AssigneeBadge email="charlie@example.com" />);
    expect(within(container).getByText("C")).toBeInTheDocument();
  });
});
