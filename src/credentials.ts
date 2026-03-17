import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { CONFIG_DIR, CREDENTIALS_PATH } from "./config.js";

export interface Credentials {
  access_token: string;
  session_token?: string;
  user_id: string;
  email: string;
}

export function loadCredentials(): Credentials | null {
  try {
    const data = readFileSync(CREDENTIALS_PATH, "utf-8");
    return JSON.parse(data) as Credentials;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: Credentials): void {
  mkdirSync(dirname(CREDENTIALS_PATH), { recursive: true, mode: 0o700 });
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), {
    mode: 0o600,
  });
}

export function clearCredentials(): void {
  try {
    unlinkSync(CREDENTIALS_PATH);
  } catch {
    // ignore if file doesn't exist
  }
}
