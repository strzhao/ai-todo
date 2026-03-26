import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    "app/**/page.tsx",
    "app/**/layout.tsx",
    "app/**/route.ts",
    "proxy.ts",
  ],
  project: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.ts"],
  ignore: [
    "**/*.test.*",
    "**/*.spec.*",
    "__tests__/**",
    "e2e/**",
  ],
  ignoreDependencies: [
    "@commitlint/config-conventional",
    "tw-animate-css",
    "shadcn",
    "@tailwindcss/postcss",
  ],
  next: {
    entry: [
      "app/**/page.tsx",
      "app/**/layout.tsx",
      "app/**/route.ts",
      "proxy.ts",
    ],
  },
};

export default config;
