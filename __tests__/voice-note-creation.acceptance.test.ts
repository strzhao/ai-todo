/**
 * Voice note creation — acceptance test (Red Team)
 *
 * Based on design document — Voice Input for Notes.
 *
 * Design spec:
 * 1. New `voice_raw_text TEXT` column on ai_todo_tasks
 * 2. Task interface gets `voice_raw_text?: string`
 * 3. POST /api/tasks with type=1 and voice_raw_text → creates note with voice_raw_text
 * 4. GET /api/tasks?type=1 → returned notes include voice_raw_text when present
 * 5. Backward compat: notes without voice_raw_text still work
 *
 * Acceptance criteria:
 * AC-1: POST /api/tasks with type=1 + voice_raw_text → 201, created note has voice_raw_text
 * AC-2: GET /api/tasks?type=1 → notes include voice_raw_text field when present
 * AC-3: Notes without voice_raw_text still return correctly (backward compat)
 * AC-4: voice_raw_text is passed through to createTask in db layer
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeGET, makePOST } from "./helpers/make-request";

// ── mock auth ────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth");

// ── mock db ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/db");

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

vi.mock("@/lib/notifications", () => ({
  getUnreadCount: vi.fn().mockResolvedValue(0),
  fireNotification: vi.fn(),
  fireNotifications: vi.fn(),
}));

vi.mock("@/lib/ai-flow-log", () => ({
  aiFlowLog: vi.fn(),
  getAiTraceIdFromHeaders: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/spaces", () => ({
  requireSpaceMember: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@vercel/postgres", () => ({
  sql: Object.assign(vi.fn(), { query: vi.fn() }),
}));

// ── imports ──────────────────────────────────────────────────────────────────

import { getUserFromRequest } from "@/lib/auth";
import { initDb, getTasks, createTask } from "@/lib/db";

// ── constants ────────────────────────────────────────────────────────────────

const USER = { id: "user-1", email: "test@example.com" };

const mockNote = {
  id: "note-1",
  title: "Meeting summary",
  description: "We discussed the roadmap",
  type: 1,
  status: 0,
  priority: 2,
  user_id: "user-1",
  created_at: "2026-03-29T00:00:00Z",
  updated_at: "2026-03-29T00:00:00Z",
  tags: ["meeting"],
  parent_id: null,
  space_id: null,
  voice_raw_text: "we discussed the roadmap in today's meeting and decided to prioritize the voice feature",
};

const mockNoteNoVoice = {
  id: "note-2",
  title: "Regular note",
  description: "Just a typed note",
  type: 1,
  status: 0,
  priority: 2,
  user_id: "user-1",
  created_at: "2026-03-29T00:00:00Z",
  updated_at: "2026-03-29T00:00:00Z",
  tags: [],
  parent_id: null,
  space_id: null,
};

describe("Voice note creation via POST /api/tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(initDb).mockResolvedValue(undefined);
  });

  it("AC-1: creates note with voice_raw_text when provided", async () => {
    vi.mocked(createTask).mockResolvedValue(mockNote as never);
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(
      makePOST("/api/tasks", {
        title: "Meeting summary",
        description: "We discussed the roadmap",
        type: 1,
        tags: ["meeting"],
        voice_raw_text: "we discussed the roadmap in today's meeting and decided to prioritize the voice feature",
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.voice_raw_text).toBe(
      "we discussed the roadmap in today's meeting and decided to prioritize the voice feature"
    );
  });

  it("AC-4: voice_raw_text is passed through to createTask", async () => {
    vi.mocked(createTask).mockResolvedValue(mockNote as never);
    const { POST } = await import("@/app/api/tasks/route");
    await POST(
      makePOST("/api/tasks", {
        title: "Meeting summary",
        type: 1,
        voice_raw_text: "raw voice transcription text",
      })
    );
    // Verify createTask was called with voice_raw_text in the data
    expect(createTask).toHaveBeenCalled();
    const callArgs = vi.mocked(createTask).mock.calls[0];
    // First arg is userId, second is the data object
    const taskData = callArgs[1] as unknown as Record<string, unknown>;
    expect(taskData.voice_raw_text).toBe("raw voice transcription text");
  });
});

describe("Voice note retrieval via GET /api/tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserFromRequest).mockResolvedValue(USER);
    vi.mocked(initDb).mockResolvedValue(undefined);
  });

  it("AC-2: returned notes include voice_raw_text when present", async () => {
    vi.mocked(getTasks).mockResolvedValue([mockNote as never]);
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(makeGET("/api/tasks", { type: "1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].voice_raw_text).toBe(
      "we discussed the roadmap in today's meeting and decided to prioritize the voice feature"
    );
  });

  it("AC-3: notes without voice_raw_text still work (backward compat)", async () => {
    vi.mocked(getTasks).mockResolvedValue([mockNoteNoVoice as never]);
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(makeGET("/api/tasks", { type: "1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("note-2");
    expect(body[0].voice_raw_text).toBeUndefined();
  });

  it("AC-2b: mixed notes — some with voice_raw_text, some without", async () => {
    vi.mocked(getTasks).mockResolvedValue([mockNote, mockNoteNoVoice] as never);
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(makeGET("/api/tasks", { type: "1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    // First note has voice_raw_text
    const withVoice = body.find((n: { id: string }) => n.id === "note-1");
    expect(withVoice.voice_raw_text).toBeTruthy();
    // Second note does not
    const withoutVoice = body.find((n: { id: string }) => n.id === "note-2");
    expect(withoutVoice.voice_raw_text).toBeUndefined();
  });
});
