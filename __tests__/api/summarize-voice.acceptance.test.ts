/**
 * API Route acceptance test: POST /api/summarize-voice
 *
 * Based on design document — Voice Input for Notes.
 *
 * Design spec:
 * 1. POST with { text }, returns { title, description?, tags? }
 * 2. Auth required (401 without)
 * 3. Max 5000 chars (400 if exceeded)
 * 4. Empty text → 400
 * 5. Degrades to raw text on LLM failure (title = truncated raw text)
 *
 * Acceptance criteria:
 * AC-1: Returns 401 without auth
 * AC-2: Returns 400 for empty text
 * AC-3: Returns 400 for text > 5000 chars
 * AC-4: Returns valid response shape { title, tags? } with mocked LLM
 * AC-5: Degrades gracefully on LLM failure — returns raw text as title
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makePOST } from "../helpers/make-request";

// ── mock auth ────────────────────────────────────────────────────────────────

const mockGetUserFromRequest = vi.fn();

vi.mock("@/lib/auth", () => ({
  getUserFromRequest: (...args: unknown[]) => mockGetUserFromRequest(...args),
}));

// ── mock db ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  initDb: vi.fn().mockResolvedValue(undefined),
}));

// ── mock route-timing ────────────────────────────────────────────────────────

vi.mock("@/lib/route-timing", () => ({
  createRouteTimer: vi.fn().mockImplementation(() => ({
    track: vi.fn().mockImplementation((_name: string, fn: () => unknown) => fn()),
    json: vi.fn().mockImplementation((data: unknown, init?: ResponseInit) =>
      Response.json(data, init)
    ),
    empty: vi.fn().mockImplementation((status: number) => new Response(null, { status })),
  })),
}));

// ── mock LLM client ─────────────────────────────────────────────────────────

const mockLlmChat = vi.fn();

vi.mock("@/lib/llm-client", () => ({
  llmClient: { chat: (...args: unknown[]) => mockLlmChat(...args) },
  LLMClient: vi.fn().mockImplementation(() => ({ chat: mockLlmChat })),
}));

// ── mock ai-flow-log ─────────────────────────────────────────────────────────

vi.mock("@/lib/ai-flow-log", () => ({
  aiFlowLog: vi.fn(),
  getAiTraceIdFromHeaders: vi.fn().mockReturnValue(null),
}));

// ── constants ────────────────────────────────────────────────────────────────

const USER = { id: "user-1", email: "test@example.com" };

describe("POST /api/summarize-voice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserFromRequest.mockResolvedValue(USER);
  });

  it("AC-1: returns 401 without auth", async () => {
    mockGetUserFromRequest.mockResolvedValue(null);
    const { POST } = await import("@/app/api/summarize-voice/route");
    const res = await POST(makePOST("/api/summarize-voice", { text: "hello" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("AC-2: returns 400 for empty text", async () => {
    const { POST } = await import("@/app/api/summarize-voice/route");
    const res = await POST(makePOST("/api/summarize-voice", { text: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("AC-2b: returns 400 for missing text field", async () => {
    const { POST } = await import("@/app/api/summarize-voice/route");
    const res = await POST(makePOST("/api/summarize-voice", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("AC-3: returns 400 for text > 5000 chars", async () => {
    const longText = "a".repeat(5001);
    const { POST } = await import("@/app/api/summarize-voice/route");
    const res = await POST(makePOST("/api/summarize-voice", { text: longText }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("AC-3b: accepts text at exactly 5000 chars", async () => {
    const exactText = "a".repeat(5000);
    mockLlmChat.mockResolvedValue(
      JSON.stringify({ title: "Summary", tags: ["note"] })
    );
    const { POST } = await import("@/app/api/summarize-voice/route");
    const res = await POST(makePOST("/api/summarize-voice", { text: exactText }));
    // Should not be 400
    expect(res.status).not.toBe(400);
  });

  it("AC-4: returns valid response shape with title and optional tags", async () => {
    mockLlmChat.mockResolvedValue(
      JSON.stringify({ title: "Meeting notes", description: "Discussed roadmap", tags: ["work", "meeting"] })
    );
    const { POST } = await import("@/app/api/summarize-voice/route");
    const res = await POST(makePOST("/api/summarize-voice", { text: "We discussed the roadmap in today's meeting and decided to prioritize the voice feature." }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("title");
    expect(typeof body.title).toBe("string");
    expect(body.title.length).toBeGreaterThan(0);
    // tags is optional but if present should be an array
    if (body.tags) {
      expect(Array.isArray(body.tags)).toBe(true);
    }
    // description is optional
    if (body.description) {
      expect(typeof body.description).toBe("string");
    }
  });

  it("AC-5: degrades gracefully on LLM failure — returns raw text as title", async () => {
    mockLlmChat.mockRejectedValue(new Error("LLM timeout"));
    const rawText = "We discussed the roadmap in today's meeting";
    const { POST } = await import("@/app/api/summarize-voice/route");
    const res = await POST(makePOST("/api/summarize-voice", { text: rawText }));
    // Should still return 200, not 500
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("title");
    // Title should contain the raw text (possibly truncated)
    expect(rawText.startsWith(body.title) || body.title === rawText).toBe(true);
  });

  it("AC-5b: degrades when LLM returns invalid JSON", async () => {
    mockLlmChat.mockResolvedValue("this is not valid json");
    const rawText = "Some voice note about groceries";
    const { POST } = await import("@/app/api/summarize-voice/route");
    const res = await POST(makePOST("/api/summarize-voice", { text: rawText }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("title");
    // Should fall back to raw text
    expect(typeof body.title).toBe("string");
    expect(body.title.length).toBeGreaterThan(0);
  });
});
