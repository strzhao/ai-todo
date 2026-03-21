import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({
  API_BASE_URL: "https://test.example.com",
  CONFIG_DIR: "/tmp/ai-todo-test",
  CREDENTIALS_PATH: "/tmp/ai-todo-test/credentials.json",
}));

vi.mock("../credentials.js", () => ({
  loadCredentials: vi.fn(),
}));

const { loadCredentials } = await import("../credentials.js");
const { apiRequest } = await import("../client.js");

const mockLoadCredentials = vi.mocked(loadCredentials);
const mockFetch = vi.fn();

describe("apiRequest", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((code?: number | string | null | undefined) => {
        throw new Error(`process.exit(${code})`);
      });
    vi.spyOn(console, "log").mockImplementation(() => {});
    mockFetch.mockReset();
    mockLoadCredentials.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("should exit with code 2 when not logged in", async () => {
    mockLoadCredentials.mockReturnValue(null);
    await expect(apiRequest("GET", "/api/todos", {}, {}, {})).rejects.toThrow(
      "process.exit(2)",
    );
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it("should build URL with path params and query params for GET", async () => {
    mockLoadCredentials.mockReturnValue({
      access_token: "tok_abc",
      user_id: "u1",
      email: "a@b.com",
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    });

    await apiRequest(
      "GET",
      "/api/todos/:id",
      { id: "42" },
      { status: "done" },
      {},
    );

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("/api/todos/42");
    expect(calledUrl).toContain("status=done");
  });

  it("should set Content-Type and body for POST requests", async () => {
    mockLoadCredentials.mockReturnValue({
      access_token: "tok_abc",
      user_id: "u1",
      email: "a@b.com",
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "1" }),
    });

    await apiRequest("POST", "/api/todos", {}, {}, { title: "test" });

    const opts = mockFetch.mock.calls[0][1];
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(opts.body)).toEqual({ title: "test" });
  });

  it("should prefer session_token over access_token for Authorization", async () => {
    mockLoadCredentials.mockReturnValue({
      access_token: "tok_abc",
      session_token: "sess_xyz",
      user_id: "u1",
      email: "a@b.com",
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await apiRequest("GET", "/api/todos", {}, {}, {});

    const opts = mockFetch.mock.calls[0][1];
    expect(opts.headers.Authorization).toBe("Bearer sess_xyz");
  });

  it("should use access_token when session_token is absent", async () => {
    mockLoadCredentials.mockReturnValue({
      access_token: "tok_abc",
      user_id: "u1",
      email: "a@b.com",
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await apiRequest("GET", "/api/todos", {}, {}, {});

    const opts = mockFetch.mock.calls[0][1];
    expect(opts.headers.Authorization).toBe("Bearer tok_abc");
  });

  it("should exit with code 2 on 401 response", async () => {
    mockLoadCredentials.mockReturnValue({
      access_token: "tok_abc",
      user_id: "u1",
      email: "a@b.com",
    });
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    });

    await expect(apiRequest("GET", "/api/todos", {}, {}, {})).rejects.toThrow(
      "process.exit(2)",
    );
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it("should return { data: { success: true }, status: 204 } for 204 response", async () => {
    mockLoadCredentials.mockReturnValue({
      access_token: "tok_abc",
      user_id: "u1",
      email: "a@b.com",
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
    });

    const result = await apiRequest(
      "DELETE",
      "/api/todos/:id",
      { id: "1" },
      {},
      {},
    );
    expect(result).toEqual({ data: { success: true }, status: 204 });
  });

  it("should exit with code 1 on non-ok response", async () => {
    mockLoadCredentials.mockReturnValue({
      access_token: "tok_abc",
      user_id: "u1",
      email: "a@b.com",
    });
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Server error" }),
    });

    await expect(apiRequest("GET", "/api/todos", {}, {}, {})).rejects.toThrow(
      "process.exit(1)",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should return data and status on success", async () => {
    mockLoadCredentials.mockReturnValue({
      access_token: "tok_abc",
      user_id: "u1",
      email: "a@b.com",
    });
    const payload = { items: [{ id: "1", title: "test" }] };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    });

    const result = await apiRequest("GET", "/api/todos", {}, {}, {});
    expect(result).toEqual({ data: payload, status: 200 });
  });

  it("should merge fixedBody with bodyParams", async () => {
    mockLoadCredentials.mockReturnValue({
      access_token: "tok_abc",
      user_id: "u1",
      email: "a@b.com",
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await apiRequest(
      "POST",
      "/api/todos",
      {},
      {},
      { title: "test" },
      { project_id: "p1" },
    );

    const opts = mockFetch.mock.calls[0][1];
    expect(JSON.parse(opts.body)).toEqual({
      title: "test",
      project_id: "p1",
    });
  });
});
