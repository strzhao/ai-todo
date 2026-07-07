# brainstorm：为 ai-todo 提供 Mac app

## 探索的目的与约束

**用户目标一句话**：在现有 ai-todo web 服务基础上新增一个 Mac app，完整桌面应用定位（替代浏览器访问），repo 放同一个工程维护。

**项目上下文探索关键发现**（Explore agent 结论）：

- 工程是**单体 npm 项目**，无 monorepo 配置（无 `pnpm-workspace.yaml` / `turbo.json` / `workspaces` 字段），包管理器 npm（`package-lock.json`）。顶层 `ai-todo-cli/` 目录为空占位，真 CLI 是独立 repo。
- 栈：Next.js 16.2（App Router, Turbopack）+ React 19.2 + shadcn/ui（new-york）+ Tailwind v4 + Radix + SWR + zod v4。质量工具齐全（Vitest、Playwright、ESLint、Knip、size-limit、husky/commitlint）。
- **已有完整 PWA 基建**：`public/manifest.json` + `public/sw.js` + `public/offline.html` + Web Push（`web-push` 依赖 + `/api/push/{vapid,subscribe}` + `lib/push.ts` + `lib/use-push.ts`）。
- **认证可复用**：`/api/auth/cli-token` 已颁发 HMAC-SHA256 签名的 90 天 Bearer `session_token`；`getUserFromRequest`（`lib/auth.ts:40`）在 JWT 验证失败后自动回退到 session token 验证，被 ~35 个 API route 引用。Mac app 可直接套用 CLI 认证模式，无需服务端为新客户端硬编码。
- CLI 架构约定：所有业务命令从 `/api/manifest` 动态下发（`app/api/manifest/route.ts` 的 `operations` 数组），严禁客户端硬编码。Mac app 的 API 调用层应复用同一 manifest 驱动模式。
- 路由保护用 `proxy.ts`（Next.js 16 约定），定义 `protectedPaths` / `protectedApiPaths`；`app/(app)/layout.tsx` 是 Server Component（读取 user + spaces + orgs）。
- 部署：Vercel（`vercel.json` region `hnd1`），生产域名 `https://ai-todo.stringzhao.life`，DB Vercel Postgres（表 `ai_todo_tasks`，Neon ap-southeast-1）。核心 API 路由约定固定 `hkg1`。

**明确约束**：

- Mac app 与 web **同 repo 维护** → 必须引入 monorepo 结构（沿用 npm，用 npm workspaces，不引入 pnpm/turbo 等新工具）。
- 前端代码**最大化复用**现有 React/shadcn/Tailwind 组件，不原生重写 UI。
- **捆绑模式**：前端构建产物打进 app 本地运行，API 走线上 `https://ai-todo.stringzhao.life`；不接受"必须联网才能用"的壳模式（用户已排除方案 C）。
- 分发：默认**直接下载**（Developer ID 签名 + 公证 + GitHub Releases + 自动更新），不进 App Store（暂无沙箱适配必要，后续可追加）。
- 色彩规范遵循 `documents/refs/colors.md` + 全局苔色体系，UI token 化用 `var(--token)`。
- 不主动触发 Vercel 部署；mac app 构建产物不依赖 Vercel。

## 候选方案与权衡

### 方案 A：Tauri 2 + Next.js static export 重构（推荐）

把 Next.js 前端改造为可静态导出（`output: 'export'`），Tauri webview 加载本地静态产物；Rust 侧承担菜单栏/全局快捷键/系统通知/托盘；认证改为 Bearer token 存 keychain。

- **优势**：包小（~10–15MB）、内存低、启动快、最接近原生体验；Rust 侧原生能力强（全局快捷键/系统通知/托盘/keychain 存 token）；Tauri 2 已支持 macOS 签名/公证/自动更新；可对接现有 Web Push 通知基建。
- **劣势**：**前端重构工作量大**——`(app)/layout.tsx` 是 Server Component 需改 CSR；移除 `proxy.ts` 路由保护改为客户端 Bearer 守卫；API routes 不导出（本就走线上，影响小但需确认无前端依赖本地 API 的路径）；认证从 httpOnly cookie 改为 Bearer token。
- **一次性成本**：SSR → CSR 重构 + 抽共享组件包。

### 方案 B：Electron + 内嵌 Next.js standalone

Electron main 进程拉起本地 Next.js standalone server（`.next/standalone`），BrowserWindow 加载 localhost，前端几乎零改动。

- **优势**：重构成本最低——Next.js SSR/proxy/layout 全保留；Electron 生态成熟（electron-builder + electron-updater + 签名公证方案现成）；菜单栏/快捷键/通知用 Node 侧写，门槛低于 Rust。
- **劣势**：包大（~150MB+，含 Chromium+Node）、内存高（~300MB+）、不够"原生"；Next.js standalone 在 Electron 内需处理子进程生命周期与端口管理。

### 方案 C：Tauri 壳加载线上 web（备选，已排除）

Tauri 只做原生外壳，webview 直接 loadUrl 线上。开发量最小但必须联网，与"捆绑模式"意愿冲突，仅作对照列出。

## 选择与理由

**选定方案：A（Tauri 2 + Next.js static export 重构）**

选择理由：

- 用户明确要"完整桌面应用 + 最大化复用前端 + 捆绑模式"，Tauri 捆绑静态前端是该组合下的正解。
- 包小、性能好、最接近原生，长期收益大；ai-todo 是个人项目，SSR→CSR 一次性重构成本可接受。
- Tauri 2 的 Rust 侧能干净地提供菜单栏/全局快捷键/系统通知/托盘/keychain，与"完整桌面应用"定位匹配。
- 认证可直接复用已验证的 `/api/auth/cli-token` 90 天 Bearer session_token 模式，服务端零改动。

被排除方案及原因：

- **方案 B（Electron）**：体积与内存代价过高，与"原生体验"目标背离；前端零改动的短期便利不抵长期负担。
- **方案 C（Tauri 壳）**：必须联网，与用户明确选择的"捆绑模式"冲突。

## 待主 SKILL 接力的设计决策

已确认的决策：

1. **技术栈**：Tauri 2（Rust 核心 + webview）+ 复用 Next.js/React/shadcn 前端。
2. **monorepo 结构**：npm workspaces，结构提案：
   ```
   ai-todo/
     package.json          # root，workspaces: ["apps/*", "packages/*"]
     apps/
       web/                # 现有 Next.js 整体下移
       mac/                # Tauri app（src-tauri/ + 前端壳）
     packages/
       ui/                 # 从 components/ 抽出的共享 React 组件
       api-client/         # 共享 API 调用 + manifest 消费（复用 cli-token 认证）
   ```
3. **加载方式**：前端 `output: 'export'` 静态导出，Tauri webview 加载本地产物；API 基址 `https://ai-todo.stringzhao.life`。
4. **认证**：复用 `/api/auth/cli-token` 颁发 90 天 Bearer `session_token`；token 存 Tauri keychain（不依赖 httpOnly cookie）；客户端 Bearer 守卫替代 `proxy.ts`。
5. **API 调用层**：复用 `/api/manifest` 动态下发模式（严禁在 mac app 硬编码业务命令），与 CLI 同源。
6. **分发**：Developer ID 签名 + 公证 + GitHub Releases + Tauri updater 自动更新；暂不进 App Store。
7. **原生能力范围（完整桌面应用定位下默认包含）**：菜单栏常驻 + 全局快捷键唤出（如 Cmd+Shift+Space）+ 系统通知（对接现有 Web Push 或走 macOS 原生通知）+ 系统托盘。

需要在设计文档中深化的点：

1. **Next.js static export 改造范围清单**：逐个清点 `(app)/layout.tsx` 及各 `page.tsx` 中哪些是 Server Component、哪些用了服务端能力（`getServerUser`、读 cookie、SSR 数据获取），给出 CSR 改造方案；确认 `proxy.ts` 移除后客户端路由守卫的实现（Bearer token 检查 + 未登录跳 `/auth/cli` 授权页，复用现有 CLI 授权流程 `app/auth/cli/`）。
2. **共享组件包 `packages/ui` 的抽取边界**：哪些 `components/` 进共享包、哪些留在 `apps/web`（web 专用如 SpaceNav 的服务端数据依赖部分）；`lib/` 纯函数（`task-utils` / `date-utils` / `parse-utils` / `note-utils` / `assignee-utils`）是否一并抽包。
3. **`packages/api-client` 设计**：基于 manifest 的命令注册、Bearer 认证拦截、SWR 适配（mac app 是否继续用 SWR 还是换 TanStack Query）；与现有 `lib/use-tasks.ts` 的关系。
4. **mac app 与 web 的差异化处理**：mac app 不需要的 web 路由（如 PWA 安装引导 `PWAInstallBanner`、`ServiceWorkerRegistrar`、`sw.js` 注册逻辑）如何屏蔽；mac app 专有入口（菜单栏/快捷键/托盘）的前后端协作。
5. **通知方案选型**：现有 Web Push（`web-push` + VAPID）能否在 Tauri webview 内复用，还是改走 Rust 侧 macOS 原生通知 + 轮询 `/api/notifications/unread-count`；两者权衡。
6. **自动更新与版本同步**：Tauri updater 的 manifest 托管方式（GitHub Releases）、与 `lib/changelog.ts` 版本号体系的关系、mac app 版本号是否独立于 web。
7. **构建与发布流程**：Tauri 构建在 CI（GitHub Actions）还是本地；签名/公证密钥的管理；不触发 Vercel 部署的边界。
8. **本地开发体验**：`apps/web` 与 `apps/mac` 并行 dev 的工作流；mac app dev 模式下前端指向 web dev server（localhost:4000）还是本地构建产物。
9. **monorepo 迁移步骤**：现有根目录文件（`app/` `components/` `lib/` `proxy.ts` `next.config.ts` 等）下移到 `apps/web/` 的迁移顺序；根 `package.json` workspaces 化；现有脚本（`dev`/`build`/`test`/`lint`/`dead-code`）与 husky/commitlint/lint-staged 的适配。
