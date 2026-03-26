import { vi } from "vitest";

export function mockAuth(user: { id: string; email: string } | null = { id: "user-1", email: "test@example.com" }) {
  vi.mock("@/lib/auth", () => ({
    getUserFromRequest: vi.fn().mockResolvedValue(user),
  }));
}

export function mockAuthUnauthorized() {
  mockAuth(null);
}
