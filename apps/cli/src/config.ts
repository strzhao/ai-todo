import { homedir } from "node:os";
import { join } from "node:path";

export const API_BASE_URL =
  process.env.AI_TODO_API_URL ?? "https://ai-todo.stringzhao.life";

export const CONFIG_DIR = join(homedir(), ".config", "ai-todo");
export const CREDENTIALS_PATH = join(CONFIG_DIR, "credentials.json");
