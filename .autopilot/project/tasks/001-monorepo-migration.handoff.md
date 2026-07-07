# T001 Handoff: monorepo 迁移

## 实现摘要

把单体 Next.js 工程下移到 `apps/web/`，root `package.json` workspaces 化（`["apps/*","packages/*"]`），脚本转发 `--workspace apps/web`。249 个文件 git mv（R100 纯重命名，保留历史），web 源码零改动。commit `da4f02c`。

## 文件变更

- **249 R100**：`app/ components/ lib/ proxy.ts next.config.ts public/ __tests__/ e2e/ scripts/ types/ next-env.d.ts` + web 配置（tsconfig/postcss/vitest/playwright/knit/components.json/.size-limit.json/.env.example）→ `apps/web/`
- **新增**：`apps/web/package.json`（name ai-todo-web v0.11.0，依赖从 root 下沉）、`apps/web/__tests__/acceptance/t001-monorepo-migration.acceptance.test.ts`
- **修改 root**：`package.json`（workspaces + 转发脚本）、`package-lock.json`、`vercel.json`（buildCommand/outputDirectory 指向 apps/web）、`.gitignore`（根锚定→非锚定）、`eslint.config.mjs`（ignores/files 加 apps/web/ 前缀）、`.github/workflows/ci.yml`（tsc --project + coverage path）、`CLAUDE.md`（项目结构路径前缀）
- **.env.local**：cp 到 apps/web/（未入 git，Next.js 16 env 基于 cwd，apps/web 运行时需本地 .env.local）

## 下游须知（T002 共享包抽取）

1. **monorepo 结构就绪**：`apps/web` 独立可构建/test/lint，`packages/` 目录尚未建（T002 建 `packages/ui` + `packages/api-client`）
2. **eslint flat config 在 root**：`eslint.config.mjs` 留 root，ignores/files 已前缀化。T002 新建 `packages/ui`/`packages/api-client` 后，若需 lint，确认 flat config 覆盖（`**/` 通配已预留）
3. **T002 核心工作量**：清点 `apps/web/components/` 内直连 `fetch("/api/...")`（约 76 处），逐一改写为 `api.call(operationId)` 或 typed 方法；TaskItem 的 `useRouter`/`router.refresh` 重构为 props 回调注入（禁 Next 专属 API 进 packages/ui）
4. **AuthStrategy 双端**：web 端 CookieAuthStrategy（cookie 自动携带），mac 端 T004 实现 BearerAuthStrategy
5. **vitest/test** 在 apps/web 跑（`npm test --workspace apps/web`），root 转发

## 偏差说明

1. **build 受 Google Fonts 网络阻断**：`next build` 因 `fonts.googleapis.com` 不通失败，contract-checker 用 git stash 在迁移前代码复现同样失败，证明是**预存环境约束，非迁移引入**。CI/有网络环境可正常 build。
2. **红队 2 failed 是测试设计缺陷**（非实现问题）：AC-T001-02 beforeAll 跑 `npm test` 递归包含自身 → SIGTERM；AC-T001-08 `git log --follow apps/web/proxy.ts` 在 commit 前跑（HEAD 无此路径）。独立验证设计意图全 PASS。
3. **ci.yml coverage path 补充修复**：qa-reviewer 发现 vitest reportsDirectory 迁 apps/web 后 ci.yml upload path 未同步，已改 `apps/web/coverage/`。
4. **commit 插曲**：首次 commit 因 commitlint body-max-line-length 失败，lint-staged 对 lib/utils.ts、lib/notification-types.ts 跑 prettier 致 D+A，已用 git show 恢复原始内容，最终提交仍是 249 R100。

## T002 前置条件满足

- ✅ apps/web 独立 `tsc --noEmit` rc=0
- ✅ apps/web `npm test` 952 passed rc=0
- ✅ apps/web `npm run lint` 0 error
- ✅ root workspaces 识别 ai-todo-web
- ✅ packages/ 目录待 T002 建
