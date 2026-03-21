import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// We need to mock config before importing credentials
const testDir = join(tmpdir(), `ai-todo-test-${randomUUID()}`);
const testCredPath = join(testDir, "credentials.json");

import { vi } from "vitest";

vi.mock("../config.js", () => ({
  CONFIG_DIR: testDir,
  CREDENTIALS_PATH: testCredPath,
  API_BASE_URL: "https://test.example.com",
}));

const { loadCredentials, saveCredentials, clearCredentials } = await import(
  "../credentials.js"
);

describe("credentials", () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should return null when no credentials file exists", () => {
    expect(loadCredentials()).toBeNull();
  });

  it("should save and load credentials", () => {
    const creds = {
      access_token: "tok_abc",
      user_id: "user_1",
      email: "test@example.com",
    };

    saveCredentials(creds);

    const loaded = loadCredentials();
    expect(loaded).toEqual(creds);
  });

  it("should save credentials with session_token", () => {
    const creds = {
      access_token: "tok_abc",
      session_token: "sess_xyz",
      user_id: "user_1",
      email: "test@example.com",
    };

    saveCredentials(creds);

    const loaded = loadCredentials();
    expect(loaded).toEqual(creds);
  });

  it("should create parent directories when saving", () => {
    rmSync(testDir, { recursive: true, force: true });

    saveCredentials({
      access_token: "tok",
      user_id: "u",
      email: "e@e.com",
    });

    expect(existsSync(testCredPath)).toBe(true);
  });

  it("should write credentials as formatted JSON", () => {
    saveCredentials({
      access_token: "tok",
      user_id: "u",
      email: "e@e.com",
    });

    const raw = readFileSync(testCredPath, "utf-8");
    expect(raw).toContain("\n"); // formatted with indent
    expect(JSON.parse(raw)).toEqual({
      access_token: "tok",
      user_id: "u",
      email: "e@e.com",
    });
  });

  it("should clear credentials by removing the file", () => {
    saveCredentials({
      access_token: "tok",
      user_id: "u",
      email: "e@e.com",
    });

    clearCredentials();

    expect(existsSync(testCredPath)).toBe(false);
    expect(loadCredentials()).toBeNull();
  });

  it("should not throw when clearing non-existent credentials", () => {
    expect(() => clearCredentials()).not.toThrow();
  });

  it("should return null for corrupted credentials file", async () => {
    mkdirSync(testDir, { recursive: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(testCredPath, "not-json{{{");

    expect(loadCredentials()).toBeNull();
  });
});
