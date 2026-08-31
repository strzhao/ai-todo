import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CLAUDE.md 位于包根目录（src/__tests__/ 的上两级），相对解析避免硬编码绝对路径
const CLAUDE_MD_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../CLAUDE.md",
);

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
const { fetchManifest } = await import("../manifest.js");

const mockLoadCredentials = vi.mocked(loadCredentials);
const mockFetch = vi.fn();

function makeCredentials(overrides: Record<string, unknown> = {}) {
  return {
    access_token: "tok_access",
    user_id: "user_1",
    email: "test@example.com",
    ...overrides,
  };
}

describe("Doctor Fix 验收测试", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    mockLoadCredentials.mockReset();
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((code?: number | string | null | undefined) => {
        throw new Error(`process.exit(${code})`);
      });
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("apiRequest 设计验证", () => {
    it("未登录时应输出错误 JSON 并以退出码 2 退出", async () => {
      mockLoadCredentials.mockReturnValue(null);

      await expect(apiRequest("GET", "/api/tasks", {}, {}, {})).rejects.toThrow(
        "process.exit(2)",
      );

      expect(logSpy).toHaveBeenCalledWith(
        JSON.stringify({ error: "Not logged in. Run: ai-todo login" }),
      );
      expect(exitSpy).toHaveBeenCalledWith(2);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("应正确替换路径参数并进行 URL 编码，同时构建查询参数且跳过空值", async () => {
      mockLoadCredentials.mockReturnValue(makeCredentials());
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

      await apiRequest(
        "GET",
        "/api/tasks/:taskId/logs/:logId",
        { taskId: "task/with space", logId: "log?name" },
        {
          q: "hello world",
          status: "open",
          empty: "",
          missing: undefined as unknown as string,
        },
        {},
      );

      const [calledUrl, options] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe(
        "https://test.example.com/api/tasks/task%2Fwith%20space/logs/log%3Fname?q=hello+world&status=open",
      );
      expect(options.method).toBe("GET");
      expect(options.body).toBeUndefined();
    });

    it("POST/PUT 请求应设置 Content-Type: application/json 并序列化 body", async () => {
      mockLoadCredentials.mockReturnValue(makeCredentials());
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ id: "created" }),
      });

      await apiRequest(
        "POST",
        "/api/tasks",
        {},
        {},
        { title: "new task", done: false },
      );

      const [, postOptions] = mockFetch.mock.calls[0];
      expect(postOptions.headers["Content-Type"]).toBe("application/json");
      expect(postOptions.body).toBe(
        JSON.stringify({ title: "new task", done: false }),
      );

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ updated: true }),
      });

      await apiRequest(
        "PUT",
        "/api/tasks/:id",
        { id: "task-1" },
        {},
        { title: "updated task" },
      );

      const [, putOptions] = mockFetch.mock.calls[1];
      expect(putOptions.headers["Content-Type"]).toBe("application/json");
      expect(putOptions.body).toBe(JSON.stringify({ title: "updated task" }));
    });

    it("GET/DELETE 请求不应发送 body", async () => {
      mockLoadCredentials.mockReturnValue(makeCredentials());
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });

      await apiRequest("GET", "/api/tasks", {}, {}, { ignored: true });
      expect(mockFetch.mock.calls[0][1].body).toBeUndefined();

      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
      });
      await apiRequest(
        "DELETE",
        "/api/tasks/:id",
        { id: "task-1" },
        {},
        { ignored: true },
      );
      expect(mockFetch.mock.calls[1][1].body).toBeUndefined();
    });

    it("Authorization header 应优先使用 session_token，缺失时 fallback 到 access_token", async () => {
      mockLoadCredentials.mockReturnValue(
        makeCredentials({
          access_token: "access-token",
          session_token: "session-token",
        }),
      );
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });

      await apiRequest("GET", "/api/tasks", {}, {}, {});
      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe(
        "Bearer session-token",
      );

      mockLoadCredentials.mockReturnValue(
        makeCredentials({
          access_token: "access-only-token",
        }),
      );
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });

      await apiRequest("GET", "/api/tasks", {}, {}, {});
      expect(mockFetch.mock.calls[1][1].headers.Authorization).toBe(
        "Bearer access-only-token",
      );
    });

    it("401 响应应以退出码 2 退出", async () => {
      mockLoadCredentials.mockReturnValue(makeCredentials());
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      });

      await expect(apiRequest("GET", "/api/tasks", {}, {}, {})).rejects.toThrow(
        "process.exit(2)",
      );

      expect(logSpy).toHaveBeenCalledWith(
        JSON.stringify({ error: "Unauthorized. Run: ai-todo login" }),
      );
      expect(exitSpy).toHaveBeenCalledWith(2);
    });

    it("204 响应应返回 { success: true }", async () => {
      mockLoadCredentials.mockReturnValue(makeCredentials());
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
      });

      const result = await apiRequest(
        "DELETE",
        "/api/tasks/:id",
        { id: "task-1" },
        {},
        {},
      );

      expect(result).toEqual({ data: { success: true }, status: 204 });
    });

    it("非 ok 响应应输出错误 JSON 并以退出码 1 退出", async () => {
      mockLoadCredentials.mockReturnValue(makeCredentials());
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "Server exploded" }),
      });

      await expect(apiRequest("GET", "/api/tasks", {}, {}, {})).rejects.toThrow(
        "process.exit(1)",
      );

      expect(logSpy).toHaveBeenCalledWith(
        JSON.stringify({ error: "Server exploded", status: 500 }),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("fixedBody 应与 bodyParams 合并，且 fixedBody 优先", async () => {
      mockLoadCredentials.mockReturnValue(makeCredentials());
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });

      await apiRequest(
        "POST",
        "/api/tasks",
        {},
        {},
        { title: "from body", priority: "low", locked: false },
        { priority: "high", source: "fixed", locked: true },
      );

      const [, options] = mockFetch.mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({
        title: "from body",
        priority: "high",
        locked: true,
        source: "fixed",
      });
    });
  });

  describe("fetchManifest 设计验证", () => {
    it("应从 API_BASE_URL/api/manifest 获取 manifest，并在成功时返回解析后的 Manifest 对象", async () => {
      const manifest = {
        version: "1.0.0",
        base_url: "https://test.example.com",
        auth: {
          type: "oauth",
          authorize_url: "https://test.example.com/auth",
          service_id: "svc_1",
          cli_auth_path: "/auth/cli",
        },
        operations: [
          {
            id: "tasks:list",
            name: "tasks:list",
            description: "List tasks",
            method: "GET",
            path: "/api/tasks",
            params: [],
            format: "json",
          },
        ],
      };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => manifest,
      });

      const result = await fetchManifest();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://test.example.com/api/manifest",
      );
      expect(result).toEqual(manifest);
    });

    it("HTTP 错误时应输出错误 JSON 并以退出码 1 退出", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
      });

      await expect(fetchManifest()).rejects.toThrow("process.exit(1)");

      expect(logSpy).toHaveBeenCalledWith(
        JSON.stringify({ error: "Failed to fetch manifest", status: 503 }),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("CLAUDE.md 文档完整性", () => {
    it("应包含常用命令章节，列出 build/dev/test/lint/format 等命令", () => {
      const claudeMd = readFileSync(CLAUDE_MD_PATH, "utf-8");

      expect(claudeMd).toContain("## 常用命令");
      expect(claudeMd).toContain("npm run build");
      expect(claudeMd).toContain("npm run dev");
      expect(claudeMd).toContain("npm test");
      expect(claudeMd).toContain("npm run lint");
      expect(claudeMd).toContain("npm run format");
    });

    it("应包含测试规范章节，说明框架、命名约定、mock 模式", () => {
      const claudeMd = readFileSync(CLAUDE_MD_PATH, "utf-8");

      expect(claudeMd).toContain("## 测试规范");
      expect(claudeMd).toContain("vitest");
      expect(claudeMd).toContain("命名约定");
      expect(claudeMd).toContain("Mock 模式");
    });
  });
});
