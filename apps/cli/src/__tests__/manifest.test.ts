import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({
  API_BASE_URL: "https://test.example.com",
  CONFIG_DIR: "/tmp/ai-todo-test",
  CREDENTIALS_PATH: "/tmp/ai-todo-test/credentials.json",
}));

const { fetchManifest } = await import("../manifest.js");

const mockFetch = vi.fn();

describe("fetchManifest", () => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("should return parsed manifest on success", async () => {
    const manifest = {
      version: "1.0",
      base_url: "https://test.example.com",
      auth: {
        type: "oauth",
        authorize_url: "https://test.example.com/auth",
        service_id: "test",
        cli_auth_path: "/auth/cli",
      },
      operations: [],
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => manifest,
    });

    const result = await fetchManifest();
    expect(result).toEqual(manifest);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://test.example.com/api/manifest",
    );
  });

  it("should exit with code 1 on HTTP error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(fetchManifest()).rejects.toThrow("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
