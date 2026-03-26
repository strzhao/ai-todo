/**
 * API Route acceptance test: GET /api/notifications/unread-count
 *
 * Verifies:
 * - 401 when not authenticated
 * - 200 + { count: number } on success
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeGET } from "../helpers/make-request";

// Mock all external dependencies
vi.mock("@/lib/auth");
vi.mock("@/lib/db");
vi.mock("@/lib/notifications", () => ({
  getUnreadCount: vi.fn().mockResolvedValue(0),
  fireNotification: vi.fn(),
  fireNotifications: vi.fn(),
}));
vi.mock("@/lib/route-timing", () => ({
  createRouteTimer: vi.fn().mockImplementation(() => ({
    track: vi.fn().mockImplementation((_name: string, fn: () => unknown) => fn()),
    json: vi.fn().mockImplementation((data: unknown, init?: ResponseInit) => Response.json(data, init)),
    empty: vi.fn().mockImplementation((status: number) => new Response(null, { status })),
  })),
}));

import { getUserFromRequest } from "@/lib/auth";
import { initDb } from "@/lib/db";
import { getUnreadCount } from "@/lib/notifications";

describe("GET /api/notifications/unread-count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserFromRequest).mockResolvedValue({ id: "user-1", email: "test@example.com" });
    vi.mocked(initDb).mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    const { GET } = await import("@/app/api/notifications/unread-count/route");
    const res = await GET(makeGET("/api/notifications/unread-count"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 200 with count=0 when no unread notifications", async () => {
    vi.mocked(getUnreadCount).mockResolvedValue(0);
    const { GET } = await import("@/app/api/notifications/unread-count/route");
    const res = await GET(makeGET("/api/notifications/unread-count"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ count: 0 });
  });

  it("returns 200 with correct count when there are unread notifications", async () => {
    vi.mocked(getUnreadCount).mockResolvedValue(5);
    const { GET } = await import("@/app/api/notifications/unread-count/route");
    const res = await GET(makeGET("/api/notifications/unread-count"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ count: 5 });
  });

  it("calls initDb before querying", async () => {
    vi.mocked(getUnreadCount).mockResolvedValue(3);
    const { GET } = await import("@/app/api/notifications/unread-count/route");
    await GET(makeGET("/api/notifications/unread-count"));
    expect(initDb).toHaveBeenCalled();
  });

  it("passes user.id to getUnreadCount", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue({ id: "user-42", email: "u42@example.com" });
    vi.mocked(getUnreadCount).mockResolvedValue(7);
    const { GET } = await import("@/app/api/notifications/unread-count/route");
    await GET(makeGET("/api/notifications/unread-count"));
    expect(getUnreadCount).toHaveBeenCalledWith("user-42");
  });

  it("exports preferredRegion as hkg1", async () => {
    const mod = await import("@/app/api/notifications/unread-count/route");
    expect(mod.preferredRegion).toBe("hkg1");
  });
});
