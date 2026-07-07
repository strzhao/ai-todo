# 项目架构设计：ai-todo Mac app

> 本文档为 ai-todo Mac app 项目的整体架构设计，由 autopilot 项目模式生成。任务 DAG 见 `dag.yaml`，各任务细节见 `tasks/NNN-*.md`。共识来源：`.autopilot/tasks/mac-app/brainstorm.md`。

## 目标

在现有 ai-todo web 服务基础上新增一个 Mac app，完整桌面应用定位（替代浏览器访问），repo 放同一个工程维护。

## 技术选型

- **应用框架**：Tauri 2（Rust 核心 + webview），包小（~10–15MB）、内存低、启动快、最接近原生
- **mac 前端**：Vite + React + react-router，引用共享包 `packages/ui` + `packages/api-client`，**非 Next.js static export**（避免污染 web SSR）
- **monorepo**：npm workspaces，结构 `apps/{web,mac}` + `packages/{ui,api-client}`，沿用现有 npm，不引入 pnpm/turbo
- **认证**：复用 `/api/auth/cli-token` 的 90 天 Bearer `session_token`（HMAC-SHA256），存 Tauri keychain；`getUserFromRequest` 已自动回退校验，服务端零改动
- **API 调用**：复用 `/api/manifest` 动态下发 operations（业务 CRUD）+ typed 命名方法（基础设施端点），严禁客户端硬编码业务命令
- **通知**：轮询 `/api/notifications/unread-count`（30s 间隔），不走 Web Push
- **分发**：Developer ID 签名 + 公证 + GitHub Releases + Tauri updater 自动更新，暂不进 App Store

> ⚠️ **对 brainstorm 共识的修正**：brainstorm.md 原选"方案 A：Tauri 2 + Next.js static export 重构"，design 阶段经 plan 审查修正为 Vite SPA。理由：static export 要求消除 `app/(app)/layout.tsx` 的 SSR + 移除 `proxy.ts`，会污染 `apps/web` 线上行为，违反"web 零回归"核心约束；Vite SPA 让 mac 前端与 web 的 Next.js 架构彻底解耦，共享层只在 `packages/ui` + `packages/api-client`。代价是 mac app 的 `/auth/cli` 授权页需在 Vite 侧重新实现，但该页逻辑简单，重写成本低。

## 目标结构

```
ai-todo/
  package.json              # root，workspaces: ["apps/*", "packages/*"]
  apps/
    web/                    # 现有 Next.js 整体下移（保留 SSR + proxy.ts + cookie 认证，线上 web 不变）
    mac/                    # Tauri 2 app
      src-tauri/            # Rust 核心（菜单栏/快捷键/通知/托盘/keychain/updater）
      src/                  # Vite + React 前端壳
      tauri.conf.json
      package.json
  packages/
    ui/                     # 共享 React 组件（从 components/ 抽可复用部分）
    api-client/             # 共享 API 调用 + manifest 消费 + Bearer 认证拦截 + SWR 适配
```

## 关键架构决策

1. **web 侧不变，mac 侧改造**：`apps/web` 保留现有 SSR + `proxy.ts` + httpOnly cookie 认证，线上 web 行为零变更。SSR→CSR 不发生在 web，mac 用独立 Vite SPA。
2. **共享包是双端契约**：`packages/ui` 提供可复用组件，`packages/api-client` 提供 API 调用层。web 和 mac 都引用，各自注入不同认证策略（web cookie 携带，mac Bearer header）。
3. **认证双轨**：web httpOnly cookie + `proxy.ts` 守卫（不变）；mac Bearer `session_token`（复用 cli-token，90 天）+ keychain + 客户端守卫。
4. **mac 前端加载策略**：Vite + React SPA，引用 `packages/ui` 自建轻量壳，不加载 web 的 static export 产物。
5. **原生能力层**（Rust 侧）：菜单栏常驻 + 全局快捷键（Cmd+Shift+Space）+ 系统通知（轮询）+ 系统托盘 + keychain + Tauri updater。
6. **分发**：Developer ID 签名 + 公证 + GitHub Releases + Tauri updater manifest。需用户提供 Apple Developer ID 证书与 notarization 凭据。

## 跨任务设计约束

1. **web 行为零回归**：T001-T002 不得改变 `apps/web` 线上行为。"web 零回归"≠"服务端零改动"：mac app 复用现有 API 路由零服务端改动；若需新增 manifest operation 元数据（不改 API 逻辑），属允许范围。
2. **共享包 API 稳定性**：`packages/ui` 和 `packages/api-client` 一旦在 T002 定义，后续任务只能扩展不能破坏性变更（semver）。
3. **mac 前端路线已定：Vite SPA**（非 static export）。T003 据此实现，无需再做路线决策。
4. **认证策略注入**：`packages/api-client` 的 AuthStrategy 必须可注入，不能硬编码任一端。
5. **Tauri 工具链现状**：当前环境缺 Rust 工具链（`which rustup cargo` 均无，仅 Xcode CLT）。T005 简报以"工具链自检 + 安装 rustup + tauri-cli"为 step 0。
6. **Apple 签名凭据**：T007 需要用户提供 Developer ID Application 证书 + notarization Apple ID + app-specific password + Team ID。缺则降级为本地未签名构建 + 流程文档。
7. **不触发 Vercel 部署**：所有任务产物不得自动 push 触发 Vercel。`vercel.json` 留 root 或迁 `apps/web/`，T001 确认 Vercel 配置不破坏。
8. **PWA 基建保留**：`apps/web` 的 PWA（manifest/sw/offline）保留不动。mac app 通知能力独立实现。
9. **CLI 认证流程复用**：mac app 的 `/auth/cli` 授权页在 Vite 侧重写 web 的 `app/auth/cli/page.tsx` 逻辑。

## 契约规约

### C1: `packages/api-client` 对外 API 契约（T002 定义，T003+ 消费）

双类端点模型：A 类业务 CRUD 走 `call(operationId)`（manifest 31 个 operation：tasks/notes/spaces/orgs/members/summary-config/space-tokens）；B 类基础设施端点走 typed 命名方法（`parseTask` / `pollUnreadCount` / `fetchNotifications` / `markNotificationsRead`）。**禁止 `packages/ui` 内任何文件直接 `fetch("/api/...")`**，所有 API 调用经 `packages/api-client`。`AuthStrategy` 可注入（web cookie / mac Bearer）。`baseUrl` web 端 `""`，mac 端线上 URL。T002 核心工作量：清点 `components/` 内所有直连 `fetch("/api/...")`（约 76 处，TaskItem/NoteCard/ActionPreview 等），逐一改写。

### C2: `packages/ui` 对外导出契约（T002 定义）

纯客户端组件，**禁止直接依赖 Next.js 专属 API**（`next/navigation` 的 `useRouter`/`router.refresh`、`next/link`、`next/headers` 等），路由/导航/刷新行为通过 props 回调注入。已知违规：`TaskItem.tsx` 的 `useRouter`/`router.refresh` 必须重构。导出清单：`TaskItem` `TaskList` `NoteCard` `ActionPreview` `NLInput` `EmptyState` `TaskSkeleton` `AssigneeBadge` `AssigneePicker` `DateTimePicker`（TaskDetail/SpaceNav 留 apps/web）。**禁止 packages/ui 内直接 fetch**。样式遵循苔色 token 体系。

### C2.1: mac app 一期功能范围

**一期包含**：任务/笔记/空间/组织 CRUD（manifest 覆盖）+ AI 自然语言录入（parse-task）+ 通知轮询 + 认证。
**一期排除**：语音转写（transcribe/summarize-voice）+ Web Push 订阅 + AI 每日总结（me/summary）+ 账号资料（account/profile）+ URL 元数据（url-meta）+ 邀请流程（invitation）。

### C3: mac app ↔ web API 契约（web 零回归）

mac app 调用线上 `https://ai-todo.stringzhao.life/api/*` 全部现有路由，web 行为零回归。服务端允许小幅扩展：新增 manifest operation 元数据（仅追加不改逻辑）。认证用 Bearer `session_token`（cli-token，90 天，`getUserFromRequest` 自动回退校验）。错误格式 `{ error: string }`，HTTP 400/401/404/503。通知轮询 `/api/notifications/unread-count`（30s）。

### C4: Tauri ↔ 前端 IPC 契约（T005 定义）

Tauri `invoke` 命令前缀 `plugin:ai-todo-*`。keychain：`invoke('plugin:ai-todo-keychain|get', { key: 'session_token' })` / `set` / `delete`。全局快捷键触发通过 `emit('global-shortcut', { id })` 通知前端。自动更新用 `tauri-plugin-updater` 标准接口。

### C5: 版本号契约

`apps/web/package.json` 工程版本维持 0.x（当前 0.11.0）。`apps/mac` 版本独立递增，从 `0.1.0` 起。changelog 产品版本 1.x 单调递增。T007 updater manifest `version` 必须与 `tauri.conf.json` 一致。

## Handoff 策略

- 每个任务 merge 阶段写 `.autopilot/project/tasks/NNN-name.handoff.md`（≤500 字）：实现摘要、文件变更、下游须知、偏差说明
- **T002 handoff 必须含共享包对外 API 契约**（`packages/ui` 导出清单 + `packages/api-client` 的 `createApiClient({ authStrategy })` 签名）
- **T003 handoff 必须明确 Vite SPA 壳的入口结构**，供 T005 接入
- **T004 handoff 必须含 Bearer token 流程时序**（登录→cli-token→keychain→后续请求）
- Auto-Chain：QA 全绿 + retry_count=0 + 无偏差 → 自动推进下一任务；有偏差则停 `review-accept`

## 验收场景（项目级 EARS-OST 谓词）

- **AC-PROJ-01**（det-machine）：root workspaces 4 项识别 + `npm install` rc=0
- **AC-PROJ-02**（det-machine）：`apps/web` 零回归（build + test rc=0，`proxy.ts` + `layout.tsx` 保留）
- **AC-PROJ-03**（det-machine）：`createApiClient` 可注入 AuthStrategy，tsc rc=0
- **AC-PROJ-04**（det-machine）：`tauri.conf.json` frontendDist 指向本地路径，非 https URL
- **AC-PROJ-05**（det-machine）：mac 端 Bearer header + cli-token 源
- **AC-PROJ-06**（det-machine）：`grep -rn 'fetch.*"/api/' packages/ui/src apps/mac/src` 白名单外无命中
- **AC-PROJ-07**（det-machine）：dmg 产物存在 + `hdiutil verify` rc=0
- **AC-PROJ-08**（freshness）：`packages/ui` + `packages/api-client` freshness FRESH

> ✅ Plan 审查通过（第 2 轮，全部 blocker + important resolved）。
