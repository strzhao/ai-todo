import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      AUTH_GATEWAY_SESSION_SECRET: "test-cli-session-secret",
    },
    setupFiles: ["__tests__/setup-dom.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["lib/**/*.ts"],
      exclude: [
        "lib/db.ts",
        "lib/email.ts",
        "lib/push.ts",
        "lib/notifications.ts",
        "lib/server-auth.ts",
        "lib/llm-client.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
