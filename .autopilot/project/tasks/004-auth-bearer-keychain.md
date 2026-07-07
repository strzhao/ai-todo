---
id: T004
name: auth-bearer-keychain
depends_on: [T003]
milestone: M2
---

# T004: Bearer 认证改造（cli-token + 客户端守卫）

## 目标

mac 端实现 Bearer `session_token` 认证：`/auth/cli` 授权页（Vite 侧重写）+ `BearerAuthStrategy` + 客户端路由守卫。token 暂存 localStorage（T005 接入 keychain 后迁移）。复用线上 `/api/auth/cli-token`，服务端零改动。

## 架构上下文

- 认证双轨（`design.md` 决策 3）：web cookie（不变），mac Bearer session_token
- 复用 `/api/auth/cli-token`（90 天，HMAC-SHA256），`getUserFromRequest` 自动回退校验（`lib/auth.ts:40`）—— 服务端零改动
- 复用 web 的 `app/auth/cli/page.tsx` 逻辑（'use client' + fetch cli-token + POST 回本地端口），在 Vite 侧重写
- C1：mac 端 AuthStrategy 注入 `packages/api-client`，`baseUrl` = `https://ai-todo.stringzhao.life`
- C3：mac app 调线上 API，web 零回归

## 实现步骤

1. 阅读现有 `apps/web/app/auth/cli/page.tsx` 与 `app/api/auth/cli-token/route.ts`，理解 cli-token 颁发流程（授权码 → session_token）
2. `apps/mac/src/auth/cli-token.ts`：实现 cli-token 获取流程
   - 跳转 `https://user.stringzhao.life/authorize?service=...&return_to=...&state=...`（复用 auth-config）
   - 回跳后用授权码 POST `/api/auth/cli-token` 换取 `session_token`
   - 存 localStorage（key `ai-todo-session-token`）
3. `apps/mac/src/auth/bearer-auth-strategy.ts`：实现 `AuthStrategy` 接口
   - `headers()`：返回 `{ Authorization: Bearer <token> }`（从 localStorage 读）
   - `onUnauthorized()`：清除 token + 跳 `/login`（401 触发）
4. `apps/mac/src/pages/login.tsx`：实现登录页 UI（"使用 stringzhao.life 账号登录"按钮 → 触发 cli-token 流程）
5. `apps/mac/src/pages/auth-callback.tsx`：授权回跳页（处理 state 校验 + 换 token + 跳转任务列表）
6. `apps/mac/src/lib/auth-guard.tsx`：完善路由守卫——未登录跳 `/login`，已登录放行
7. 替换 T003 的 `NoopAuthStrategy` 为 `BearerAuthStrategy`（`src/lib/api.ts`）
8. 验证：mac dev 模式完成登录流程，能持 token 调 `/api/tasks` 返回真实数据

## 输入/输出契约

- **输入**：T003 产出的 `apps/mac` Vite 壳（ApiClient 实例化位置 + 路由守卫位置）
- **输出**：`apps/mac/src/auth/` 完整认证模块 + `BearerAuthStrategy` 注入 + 登录页 + 授权回跳页 + 路由守卫
- **下游契约（handoff 必含）**：
  - Bearer token 流程时序（登录→authorize→回跳→cli-token→localStorage→后续请求 Bearer header）
  - `BearerAuthStrategy` 的 token 存取位置（localStorage key），T005 迁移到 keychain 时替换 `headers()` 读取源
  - 401 处理流程（`onUnauthorized` 清 token + 跳登录）

## 验收标准

- [ ] mac 端登录按钮点击跳转 `user.stringzhao.life/authorize`
- [ ] 授权回跳后成功换取 `session_token`，存 localStorage
- [ ] 后续 API 请求 header 含 `Authorization: Bearer <token>`（浏览器 DevTools Network 验证）
- [ ] 调 `/api/tasks` 返回真实任务数据（rc=200）
- [ ] 401 触发 `onUnauthorized`：清 token + 跳 `/login`
- [ ] 路由守卫：未登录访问 `/` 自动跳 `/login`
- [ ] `apps/mac/src/auth/**` 是 AC-PROJ-06 白名单（允许直接调 cli-token 端点）

## 风险与注意事项

- OAuth 回跳在 Tauri webview 内的行为可能与浏览器不同（`return_to` 需用 mac app 的回调 URL，T005 接入 Tauri 后可能需 deep link）。**本任务在浏览器 dev 模式验证**，Tauri 集成在 T005 处理
- `state` 校验：localStorage 存 state，回跳对比 query（防 CSRF），与 web 的 `proxy.ts` state 逻辑一致
- CORS：mac dev `localhost:5173` 调 `ai-todo.stringzhao.life/api/auth/cli-token` 可能需 CORS 配置或 Vite proxy。先试线上 CORS，不行用 Vite proxy 转发
- cli-token 颁发可能需 `service` 标识，确认 auth-config 的 `service` 字段是否支持 mac app（可能需新增 service id，属服务端改动——若需要，在简报声明并走 C3 manifest 元数据扩展范围）
