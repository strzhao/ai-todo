---
id: T001
name: monorepo-migration
depends_on: []
milestone: M1
---

# T001: monorepo 迁移

## 目标

把现有单体 Next.js 工程下移到 `apps/web/`，root `package.json` workspaces 化，为后续共享包与 mac app 腾出 monorepo 结构。**web 行为零回归**是硬约束。

## 架构上下文

- 当前：单体 npm 项目，根目录直接是 `app/` `components/` `lib/` `proxy.ts` `next.config.ts` `public/` `__tests__/` `e2e/` `scripts/` `types/` 等
- 目标结构见 `design.md` 目标结构章节：`apps/web/`（现有整体下移）+ 后续 `apps/mac/` + `packages/{ui,api-client}`
- 包管理器沿用 npm（`package-lock.json`），用 npm workspaces，不引入 pnpm/turbo
- 现有质量工具：husky/commitlint/lint-staged/knip/size-limit/eslint/prettier/vitest/playwright，迁移后路径需适配

## 实现步骤

1. `git mv` 根目录的 `app/` `components/` `lib/` `proxy.ts` `next.config.ts` `public/` `__tests__/` `e2e/` `scripts/` `types/` `next-env.d.ts` `tsconfig.json` `tsconfig.tsbuildinfo` `postcss.config.mjs` `eslint.config.mjs` `vitest.config.ts` `playwright.config.ts` `playwright.perf.config.ts` `knip.config.ts` `components.json` 到 `apps/web/`
2. root `package.json`：name 改 `ai-todo-monorepo`，加 `"workspaces": ["apps/*", "packages/*"]`，保留私有脚本作为转发（`"dev": "npm run dev --workspace apps/web"` 等），或改为 `--workspace` 形式
3. `apps/web/package.json`：从原 root package.json 继承依赖与脚本（dev/build/start/test/lint 等），name `ai-todo-web`
4. 路径别名：`apps/web/tsconfig.json` 的 `@/*` 指向 `apps/web/*`（apps/web 内部相对，不变）；root `tsconfig.json` 可加 references 或留空
5. husky/commitlint/lint-staged：`.husky/` 留 root，命令路径加 `--workspace apps/web` 或 `cd apps/web &&`；`commitlint.config.mjs` 留 root
6. knip/size-limit/eslint：配置文件迁入 `apps/web/`，路径基准调整为 `apps/web/`
7. `vercel.json`：确认 Vercel 项目 root 还是 apps/web（Vercel monorepo 通常 root Deployment + `apps/web` 为 build target），保持不破坏线上部署配置。**不主动触发部署**
8. `.autopilot/` `.claude/` `documents/` `ai-todo-cli/`(空占位) 留 root
9. 验证：`npm install`（root）+ `npm run dev --workspace apps/web` + `npm test --workspace apps/web` + `npm run build --workspace apps/web` + `npm run lint --workspace apps/web` 全绿

## 输入/输出契约

- **输入**：现有根目录工程（git 干净）
- **输出**：`apps/web/` 完整下移 + root workspaces 配置 + 脚本转发 + 质量工具路径适配
- **下游契约**：T002 依赖 `apps/web` 可独立 `tsc --noEmit` + `npm test` 通过；`packages/` 目录已就绪（空目录或 placeholder）

## 验收标准

- [ ] `npm install`（root）rc=0，`npm ls --workspaces --depth=0` 输出含 `apps/web`
- [ ] `npm run build --workspace apps/web` rc=0
- [ ] `npm test --workspace apps/web` rc=0（732 个用例全过）
- [ ] `npm run lint --workspace apps/web` rc=0
- [ ] `apps/web/proxy.ts` 存在，`apps/web/app/(app)/layout.tsx` 仍是 Server Component（未改 SSR）
- [ ] `apps/web/next.config.ts` 未改 `output` 配置（仍为默认，非 export）
- [ ] `vercel.json` 配置未破坏（diff 仅路径调整，不改变部署语义）
- [ ] git 提交信息符合 commitlint 规范

## 风险与注意事项

- `git mv` 大量文件会产生大 diff，commit message 应清晰说明"纯迁移，无逻辑改动"
- Vercel monorepo 配置：若 Vercel 识别 root 为项目，build command 需指向 `apps/web`，提前在 Vercel dashboard 确认（不主动改 Vercel 设置）
- husky hooks 路径变化可能导致 commit 时 lint-staged 找不到文件，需测一次真实 commit
- `tsconfig.tsbuildinfo` 可删除（构建时重新生成）
