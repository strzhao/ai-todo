import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "apps/web/.next/",
      "apps/web/node_modules/",
      "apps/web/public/sw.js",
      "**/.next/",
      "**/node_modules/",
      ".autopilot/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-undef": "off",
    },
  },
  {
    files: ["apps/web/types/**/*.d.ts", "**/types/**/*.d.ts"],
    rules: {
      "no-var": "off",
    },
  }
);
