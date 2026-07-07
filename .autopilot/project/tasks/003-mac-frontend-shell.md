---
id: T003
name: mac-frontend-shell
depends_on: [T002]
milestone: M2
---

# T003: mac 前端 Vite+React 壳

## 目标

建 `apps/mac/src/`，用 Vite + React + react-router 实现最小可运行的前端壳，引用 `packages/ui` + `packages/api-client`，含登录页 + 任务列表页 + AI 输入框。路线已定（Vite SPA，非 static export）。

## 架构上下文

- mac 前端是独立 Vite SPA，不依赖 Next.js（`design.md` 决策 4 + 跨任务约束 3）
- 引用 `packages/ui`（T002 产出的 10 个组件）+ `packages/api-client`（`createApiClient` + typed 方法）
- mac 端 AuthStrategy 在 T004 实现，本任务先用占位 `NoopAuthStrategy` 或 localStorage 简化版，T004 替换
- baseUrl 指向 `https://ai-todo.stringzhao.life`（mac 端线上 API）
- C2.1 一期功能范围：任务/笔记/空间 CRUD + AI 录入 + 通知轮询 + 认证

## 实现步骤

1. 建 `apps/mac/`：`package.json`（name `ai-todo-mac`，version `0.1.0`，依赖 `@ai-todo/ui` `@ai-todo/api-client` `react` `react-dom` `react-router-dom` `swr`，devDeps `vite` `@vitejs/plugin-react` `typescript`）+ `vite.config.ts` + `tsconfig.json` + `index.html` + `src/`
2. `src/main.tsx`：React root + RouterProvider
3. `src/router.tsx`：路由定义（`/` 任务列表、`/login` 登录页、`/auth/cli` 授权页占位）
4. `src/pages/login.tsx`：登录页（占位，T004 实现真实 cli-token 流程）
5. `src/pages/today.tsx`：今日任务列表页，引用 `packages/ui` 的 `TaskList` + `NLInput` + `ActionPreview`，数据走 `packages/api-client` 的 `useTasks` / `parseTask`
6. `src/lib/api.ts`：创建 mac 端 ApiClient 实例（`createApiClient({ baseUrl: "https://ai-todo.stringzhao.life", authStrategy: new NoopAuthStrategy() })`，T004 替换为 BearerAuthStrategy），通过 Context 暴露
7. `src/lib/auth-guard.tsx`：路由守卫占位（未登录跳 `/login`，T004 完善）
8. 样式：复用苔色 token，`src/styles/globals.css` 引用 web 的 `app/globals.css` token 定义（或抽到 `packages/ui/styles`，T002 若已抽则直接引用）
9. 验证：`npm run build --workspace apps/mac` 产出 `dist/`，`npm run dev --workspace apps/mac` 启动能渲染登录页 + 任务列表（API 调用会 401，T004 解决认证）

## 输入/输出契约

- **输入**：T002 产出的 `packages/ui` + `packages/api-client`（含导出清单与 API 签名）
- **输出**：`apps/mac/` Vite+React SPA 壳，`npm run build` 产出 `dist/` 静态资源
- **下游契约（handoff 必含）**：
  - `apps/mac` 入口结构（`index.html` + `src/main.tsx` + 路由）
  - `dist/` 产物路径（供 T005 `tauri.conf.json` 的 `frontendDist` 指向）
  - ApiClient 实例化位置（`src/lib/api.ts`），T004 在此替换 AuthStrategy
  - 路由守卫位置（`src/lib/auth-guard.tsx`），T004 完善认证跳转

## 验收标准

- [ ] `npm run build --workspace apps/mac` rc=0，产出 `apps/mac/dist/index.html` + 资源
- [ ] `npm run dev --workspace apps/mac` 启动，浏览器访问能渲染登录页 + 任务列表页骨架
- [ ] `apps/mac` 引用 `@ai-todo/ui` + `@ai-todo/api-client`（无直接 fetch Next.js API）
- [ ] `apps/mac/src` 内无 `next/*` 依赖（`grep -rn 'next/' apps/mac/src` 无命中）
- [ ] 苔色 token 正确应用（视觉与 web 一致）
- [ ] `apps/mac/package.json` version `0.1.0`

## 风险与注意事项

- Vite 的 `@ai-todo/ui` 引用需配置 workspace 链接（npm workspaces 自动处理，但需 `packages/ui` 的 `package.json` exports 正确）
- `packages/ui` 组件若依赖 `@/components/ui/*`（shadcn 内部），需确保 shadcn 组件也在 packages/ui 内或 apps/mac 自带
- react-router 与 packages/ui 的 `onNavigate` 回调契约要对齐（web 用 next/navigation，mac 用 react-router）
- 样式 token：若 `app/globals.css` 的 `@tailwind` 指令在 Vite 下需重新配置 Tailwind v4 PostCSS，确保 token CSS 变量可用
- API 跨域：mac dev 模式 `localhost:5173` 调 `ai-todo.stringzhao.life` 会遇 CORS，需 Vite proxy 或线上 CORS 配置（T004 认证时确认）
