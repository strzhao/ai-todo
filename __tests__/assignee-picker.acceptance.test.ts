import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const localStorageStore: Record<string, string> = {};

const localStorageMock: Storage = {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageStore[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageStore[key];
  }),
  clear: vi.fn(() => {
    for (const k of Object.keys(localStorageStore)) delete localStorageStore[k];
  }),
  get length() {
    return Object.keys(localStorageStore).length;
  },
  key: vi.fn((i: number) => Object.keys(localStorageStore)[i] ?? null),
};

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

// ---------------------------------------------------------------------------
// Lazy import – the module under test may not exist yet (Red Team writes first)
// ---------------------------------------------------------------------------

// We'll import at the top level; if the module doesn't exist the whole suite
// fails immediately which is the desired "red" signal for Blue Team.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getRecentAssignees: (spaceId: string) => string[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let addRecentAssignee: (spaceId: string, email: string) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sortMembers: (
  members: Array<{ email: string; display_name?: string; nickname?: string; status?: string }>,
  currentEmail: string | undefined,
  spaceId: string,
) => Array<{ email: string; display_name?: string; nickname?: string; status?: string }>;

beforeEach(async () => {
  // Reset localStorage between tests
  localStorageMock.clear();
  vi.clearAllMocks();

  // Dynamic import to pick up the latest module (and fail clearly if missing)
  const mod = await import("@/lib/assignee-utils");
  getRecentAssignees = mod.getRecentAssignees;
  addRecentAssignee = mod.addRecentAssignee;
  sortMembers = mod.sortMembers;
});

// ===========================================================================
// getRecentAssignees
// ===========================================================================

describe("getRecentAssignees", () => {
  it("returns empty array when no data stored", () => {
    expect(getRecentAssignees("space-1")).toEqual([]);
  });

  it("returns stored emails in order", () => {
    localStorageStore["assignee_recent_space-1"] = JSON.stringify([
      "alice@example.com",
      "bob@example.com",
    ]);
    expect(getRecentAssignees("space-1")).toEqual(["alice@example.com", "bob@example.com"]);
  });

  it("uses the correct key format: assignee_recent_{spaceId}", () => {
    localStorageStore["assignee_recent_xyz"] = JSON.stringify(["a@b.com"]);
    expect(getRecentAssignees("xyz")).toEqual(["a@b.com"]);
    // Different spaceId should not see the data
    expect(getRecentAssignees("other")).toEqual([]);
  });

  it("returns empty array when localStorage throws", () => {
    vi.mocked(localStorageMock.getItem).mockImplementationOnce(() => {
      throw new Error("SecurityError: localStorage not available");
    });
    expect(getRecentAssignees("space-1")).toEqual([]);
  });

  it("returns empty array for corrupted JSON", () => {
    localStorageStore["assignee_recent_space-1"] = "not-valid-json{";
    expect(getRecentAssignees("space-1")).toEqual([]);
  });
});

// ===========================================================================
// addRecentAssignee
// ===========================================================================

describe("addRecentAssignee", () => {
  it("adds new email to front of list", () => {
    addRecentAssignee("s1", "alice@example.com");
    const result = getRecentAssignees("s1");
    expect(result[0]).toBe("alice@example.com");
  });

  it("moves existing email to front (dedup)", () => {
    addRecentAssignee("s1", "alice@example.com");
    addRecentAssignee("s1", "bob@example.com");
    addRecentAssignee("s1", "alice@example.com");

    const result = getRecentAssignees("s1");
    expect(result).toEqual(["alice@example.com", "bob@example.com"]);
    expect(result[0]).toBe("alice@example.com");
  });

  it("caps list at 5 entries, removing oldest", () => {
    const emails = [
      "a@example.com",
      "b@example.com",
      "c@example.com",
      "d@example.com",
      "e@example.com",
      "f@example.com",
    ];
    for (const email of emails) {
      addRecentAssignee("s1", email);
    }
    const result = getRecentAssignees("s1");
    expect(result).toHaveLength(5);
    // The oldest (a@) should be evicted; the newest (f@) should be first
    expect(result[0]).toBe("f@example.com");
    expect(result).not.toContain("a@example.com");
  });

  it("does nothing for empty string email", () => {
    addRecentAssignee("s1", "alice@example.com");
    addRecentAssignee("s1", "");
    const result = getRecentAssignees("s1");
    expect(result).toEqual(["alice@example.com"]);
  });

  it("handles localStorage errors gracefully (no throw)", () => {
    vi.mocked(localStorageMock.setItem).mockImplementationOnce(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => addRecentAssignee("s1", "alice@example.com")).not.toThrow();
  });

  it("isolates data between different spaceIds", () => {
    addRecentAssignee("s1", "alice@example.com");
    addRecentAssignee("s2", "bob@example.com");

    expect(getRecentAssignees("s1")).toEqual(["alice@example.com"]);
    expect(getRecentAssignees("s2")).toEqual(["bob@example.com"]);
  });
});

// ===========================================================================
// sortMembers – pure function sorting logic
// ===========================================================================

describe("sortMembers", () => {
  const makeMember = (
    email: string,
    opts?: { display_name?: string; nickname?: string; status?: string },
  ) => ({
    email,
    display_name: opts?.display_name,
    nickname: opts?.nickname,
    status: opts?.status ?? "active",
  });

  it("places unassign option (empty email) first", () => {
    const members = [makeMember("alice@example.com"), makeMember("bob@example.com")];
    const sorted = sortMembers(members, undefined, "s1");
    // The first entry should represent "unassign" (empty email)
    expect(sorted[0].email).toBe("");
  });

  it("places currently selected member right after unassign", () => {
    const members = [
      makeMember("alice@example.com", { display_name: "Alice" }),
      makeMember("bob@example.com", { display_name: "Bob" }),
      makeMember("charlie@example.com", { display_name: "Charlie" }),
    ];
    const sorted = sortMembers(members, "charlie@example.com", "s1");
    expect(sorted[0].email).toBe(""); // unassign
    expect(sorted[1].email).toBe("charlie@example.com"); // currently selected
  });

  it("places recent members before non-recent members", () => {
    // Set up recent assignees for space s1
    addRecentAssignee("s1", "bob@example.com");

    const members = [
      makeMember("alice@example.com", { display_name: "Alice" }),
      makeMember("bob@example.com", { display_name: "Bob" }),
      makeMember("charlie@example.com", { display_name: "Charlie" }),
    ];
    const sorted = sortMembers(members, undefined, "s1");

    // After unassign, bob (recent) should come before alice and charlie
    const bobIdx = sorted.findIndex((m) => m.email === "bob@example.com");
    const aliceIdx = sorted.findIndex((m) => m.email === "alice@example.com");
    const charlieIdx = sorted.findIndex((m) => m.email === "charlie@example.com");
    expect(bobIdx).toBeLessThan(aliceIdx);
    expect(bobIdx).toBeLessThan(charlieIdx);
  });

  it("sorts non-recent members alphabetically by displayLabel", () => {
    const members = [
      makeMember("z@example.com", { display_name: "Zara" }),
      makeMember("a@example.com", { display_name: "Amy" }),
      makeMember("m@example.com", { display_name: "Mia" }),
    ];
    const sorted = sortMembers(members, undefined, "s1");

    // Skip the first entry (unassign), the remaining should be alphabetical
    const nonUnassign = sorted.filter((m) => m.email !== "");
    expect(nonUnassign.map((m) => m.display_name)).toEqual(["Amy", "Mia", "Zara"]);
  });

  it("does not duplicate currently selected member when also in recent list", () => {
    addRecentAssignee("s1", "alice@example.com");

    const members = [
      makeMember("alice@example.com", { display_name: "Alice" }),
      makeMember("bob@example.com", { display_name: "Bob" }),
    ];
    const sorted = sortMembers(members, "alice@example.com", "s1");

    const aliceCount = sorted.filter((m) => m.email === "alice@example.com").length;
    expect(aliceCount).toBe(1);
    // Alice should be in the "currently selected" slot (index 1)
    expect(sorted[1].email).toBe("alice@example.com");
  });

  it("excludes inactive members from recent section", () => {
    addRecentAssignee("s1", "inactive@example.com");

    const members = [
      makeMember("active@example.com", { display_name: "Active", status: "active" }),
      makeMember("inactive@example.com", { display_name: "Inactive", status: "pending" }),
    ];
    const sorted = sortMembers(members, undefined, "s1");

    // inactive member should not appear in the recent section before active members
    // The active member that is not recent should still appear
    const activeIdx = sorted.findIndex((m) => m.email === "active@example.com");
    const inactiveIdx = sorted.findIndex((m) => m.email === "inactive@example.com");
    // inactive member in recent list should not get priority over active non-recent
    // (design says "active, not current" for recent section)
    expect(activeIdx).toBeLessThan(inactiveIdx);
  });

  it("preserves recent order among recent members", () => {
    // charlie added first, then bob — bob is more recent
    addRecentAssignee("s1", "charlie@example.com");
    addRecentAssignee("s1", "bob@example.com");

    const members = [
      makeMember("alice@example.com", { display_name: "Alice" }),
      makeMember("bob@example.com", { display_name: "Bob" }),
      makeMember("charlie@example.com", { display_name: "Charlie" }),
    ];
    const sorted = sortMembers(members, undefined, "s1");

    const bobIdx = sorted.findIndex((m) => m.email === "bob@example.com");
    const charlieIdx = sorted.findIndex((m) => m.email === "charlie@example.com");
    expect(bobIdx).toBeLessThan(charlieIdx);
  });
});
