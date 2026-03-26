import { vi } from "vitest";

export function mockDb(overrides: Record<string, unknown> = {}) {
  vi.mock("@/lib/db", () => ({
    initDb: vi.fn().mockResolvedValue(undefined),
    getTasks: vi.fn().mockResolvedValue([]),
    getTodayTasks: vi.fn().mockResolvedValue([]),
    getCompletedTasks: vi.fn().mockResolvedValue({ tasks: [], hasMore: false }),
    createTask: vi.fn().mockImplementation((_uid: string, data: Record<string, unknown>) => Promise.resolve({ id: "new-task-1", user_id: _uid, status: 0, priority: 2, tags: [], sort_order: 0, progress: 0, created_at: new Date().toISOString(), ...data })),
    getTaskById: vi.fn().mockResolvedValue(null),
    getTaskForUser: vi.fn().mockResolvedValue(null),
    completeTask: vi.fn().mockImplementation((id: string) => Promise.resolve({ id, status: 2, title: "Completed", completed_at: new Date().toISOString() })),
    reopenTask: vi.fn().mockImplementation((id: string) => Promise.resolve({ id, status: 0, title: "Reopened" })),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    updateTask: vi.fn().mockResolvedValue(null),
    pinTask: vi.fn().mockResolvedValue(null),
    unpinTask: vi.fn().mockResolvedValue(undefined),
    setShareCode: vi.fn().mockResolvedValue(undefined),
    generateShareCode: vi.fn().mockReturnValue("abc12345"),
    TaskValidationError: class TaskValidationError extends Error {},
    ...overrides,
  }));
}
