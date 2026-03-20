// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the push utilities before importing the component
vi.mock("@/lib/use-push", () => ({
  isPushSupported: vi.fn(() => true),
  subscribeToPush: vi.fn(() => Promise.resolve(true)),
  isCurrentlySubscribed: vi.fn(() => Promise.resolve(false)),
}));

import { PushPromptBanner } from "@/components/PushPromptBanner";
import { isPushSupported, subscribeToPush, isCurrentlySubscribed } from "@/lib/use-push";

afterEach(cleanup);

describe("PushPromptBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Set up Notification mock
    Object.defineProperty(window, "Notification", {
      value: { permission: "default" },
      writable: true,
      configurable: true,
    });

    // Reset mocks to defaults
    vi.mocked(isPushSupported).mockReturnValue(true);
    vi.mocked(isCurrentlySubscribed).mockResolvedValue(false);
    vi.mocked(subscribeToPush).mockResolvedValue(true);
  });

  it("renders nothing initially when visit count < 3", async () => {
    const { container } = render(<PushPromptBanner />);
    await act(async () => {});
    // Should be empty or contain only empty divs
    expect(container.querySelector(".bg-sage-mist")).toBeNull();
  });

  it("renders banner after 3+ visits", async () => {
    localStorage.setItem("push_prompt_visit_count", "2"); // next visit = 3
    const { container } = render(<PushPromptBanner />);
    await act(async () => {});
    expect(within(container).getByText("开启推送通知，及时收到任务提醒")).toBeInTheDocument();
    expect(within(container).getByText("开启")).toBeInTheDocument();
    expect(within(container).getByText("以后再说")).toBeInTheDocument();
  });

  it("renders nothing when push is not supported", async () => {
    localStorage.setItem("push_prompt_visit_count", "5");
    vi.mocked(isPushSupported).mockReturnValue(false);

    const { container } = render(<PushPromptBanner />);
    await act(async () => {});
    expect(container.querySelector(".bg-sage-mist")).toBeNull();
  });

  it("renders nothing when notification permission is denied", async () => {
    localStorage.setItem("push_prompt_visit_count", "5");
    Object.defineProperty(window, "Notification", {
      value: { permission: "denied" },
      writable: true,
      configurable: true,
    });

    const { container } = render(<PushPromptBanner />);
    await act(async () => {});
    expect(container.querySelector(".bg-sage-mist")).toBeNull();
  });

  it("renders nothing when already subscribed", async () => {
    localStorage.setItem("push_prompt_visit_count", "5");
    vi.mocked(isCurrentlySubscribed).mockResolvedValue(true);

    const { container } = render(<PushPromptBanner />);
    await act(async () => {});
    expect(container.querySelector(".bg-sage-mist")).toBeNull();
  });

  it("dismiss sets localStorage and hides banner", async () => {
    const user = userEvent.setup();
    localStorage.setItem("push_prompt_visit_count", "5");

    const { container } = render(<PushPromptBanner />);
    await act(async () => {});

    await user.click(within(container).getByText("以后再说"));
    expect(localStorage.getItem("push_prompt_dismissed_at")).toBeTruthy();
    expect(container.querySelector(".bg-sage-mist")).toBeNull();
  });

  it("enable button calls subscribeToPush and hides on success", async () => {
    const user = userEvent.setup();
    localStorage.setItem("push_prompt_visit_count", "5");

    const { container } = render(<PushPromptBanner />);
    await act(async () => {});

    await user.click(within(container).getByText("开启"));
    expect(subscribeToPush).toHaveBeenCalled();

    await act(async () => {});
    expect(container.querySelector(".bg-sage-mist")).toBeNull();
  });

  it("renders nothing when recently dismissed", async () => {
    localStorage.setItem("push_prompt_visit_count", "5");
    localStorage.setItem("push_prompt_dismissed_at", String(Date.now()));

    const { container } = render(<PushPromptBanner />);
    await act(async () => {});
    expect(container.querySelector(".bg-sage-mist")).toBeNull();
  });
});
