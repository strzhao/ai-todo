// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { TaskSkeleton } from "@/components/TaskSkeleton";

afterEach(cleanup);

describe("TaskSkeleton", () => {
  it("renders 3 skeleton rows", () => {
    const { container } = render(<TaskSkeleton />);
    const rows = container.querySelectorAll(".flex.items-start");
    expect(rows).toHaveLength(3);
  });

  it("each row has a circle placeholder and pulse elements", () => {
    const { container } = render(<TaskSkeleton />);
    const circles = container.querySelectorAll(".rounded-full");
    expect(circles).toHaveLength(3);

    const pulseElements = container.querySelectorAll(".animate-pulse");
    expect(pulseElements.length).toBeGreaterThanOrEqual(9);
  });

  it("title bars have increasing widths", () => {
    const { container } = render(<TaskSkeleton />);
    // Select title bars more specifically: direct children of flex-1 containers
    const allPulse = container.querySelectorAll(".animate-pulse");
    const titleBars = Array.from(allPulse).filter(
      (el) => el.classList.contains("h-4") && el.classList.contains("rounded")
    );
    expect(titleBars).toHaveLength(3);
    expect((titleBars[0] as HTMLElement).style.width).toBe("60%");
    expect((titleBars[1] as HTMLElement).style.width).toBe("75%");
    expect((titleBars[2] as HTMLElement).style.width).toBe("90%");
  });
});
