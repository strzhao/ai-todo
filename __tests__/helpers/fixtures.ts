import type { Task, TaskMember, Organization } from "@/lib/types";

export function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: "task-1",
    user_id: "user-1",
    title: "Test task",
    priority: 2,
    status: 0,
    tags: [],
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    progress: 0,
    ...overrides,
  } as Task;
}

export function makeMember(overrides?: Partial<TaskMember>): TaskMember {
  return {
    id: "member-1",
    task_id: "space-1",
    user_id: "user-1",
    email: "test@example.com",
    role: "member",
    status: "active",
    joined_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function makeOrg(overrides?: Partial<Organization>): Organization {
  return {
    id: "org-1",
    name: "Test Org",
    owner_id: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export const TEST_USER = { id: "user-1", email: "test@example.com" };
export const OTHER_USER = { id: "user-2", email: "other@example.com" };
