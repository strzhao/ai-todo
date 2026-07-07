---
id: T002
name: shared-packages-extraction
depends_on: [T001]
milestone: M1
---

# T002: 抽取共享包 packages/ui + packages/api-client

## 目标

从 `apps/web` 抽出可复用的 UI 组件包 `packages/ui` 与 API 调用层 `packages/api-client`，定义双端契约（C1/C2），web 改引用共享包并注入 cookie AuthStrategy。**web 行为零回归**是硬约束。

## 架构上下文

- 共享包是 web 与 mac 的双端契约（`design.md` 决策 2）
- C1 双类端点模型：A 类业务 CRUD 走 `call(operationId)`（manifest 31 个 operation），B 类基础设施端点走 typed 方法（parseTask/pollUnreadCount/fetchNotifications/markNotificationsRead）
- C2 禁止 `packages/ui` 直接依赖 Next.js 专属 API（`next/navigation`/`next/link`/`next/headers`），路由/导航通过 props 回调注入
- C2 禁止 `packages/ui` 内任何文件直接 `fetch("/api/...")`
- AuthStrategy 可注入：web 注入 cookie 携带，mac 注入 Bearer header

## 实现步骤

1. 建 `packages/ui`：`package.json`（name `@ai-todo/ui`，exports）+ `tsconfig.json` + `src/index.ts`
2. 从 `apps/web/components/` 抽可复用纯客户端组件到 `packages/ui/src/`：`TaskItem` `TaskList` `NoteCard` `ActionPreview` `NLInput` `EmptyState` `TaskSkeleton` `AssigneeBadge` `AssigneePicker` `DateTimePicker`。**TaskDetail/SpaceNav 留 apps/web**
3. **核心工作量：清点抽出的组件内所有直连 `fetch("/api/...")`（约 76 处，TaskItem/NoteCard/ActionPreview/NLInput 等），逐一改写**：
   - 业务 CRUD（tasks/notes/spaces/orgs/members）→ `api.call(operationId)`
   - 基础设施端点（parse-task/notifications）→ typed 方法（`api.parseTask()` / `api.pollUnreadCount()` 等）
   - 用 `grep -rn 'fetch.*"/api/' packages/ui/src` 验证白名单外无命中
4. **重构 Next 专属 API 依赖**：`TaskItem.tsx` 的 `useRouter`/`router.refresh` → props 回调 `onRefresh?: () => void`；其他组件类似处理。`grep -rn 'next/navigation\|next/link\|next/headers' packages/ui/src` 应无命中
5. 建 `packages/api-client`：`package.json`（name `@ai-todo/api-client`，exports）+ `tsconfig.json` + `src/index.ts` + `src/auth-strategy.ts` + `src/client.ts` + `src/hooks.ts`
   - `AuthStrategy` 接口（`headers()` + `onUnauthorized()`）
   - `createApiClient({ baseUrl, authStrategy })` 工厂
   - `ApiClient.call<T>(operationId, params)` —— 走 `/api/manifest` 动态获取 operations（运行时 fetch manifest 缓存）
   - typed B 类方法：`parseTask`/`pollUnreadCount`/`fetchNotifications`/`markNotificationsRead`
   - SWR hooks：`useTasks`/`useNotes` 等（内部走 `call(operationId)`）
   - 从 `apps/web/lib/types.ts` 抽共享类型到 `packages/api-client/src/types.ts`（Task/Note/ParsedAction/AppNotification 等）
6. `apps/web` 改引用：`components/` 内保留的组件（TaskDetail/SpaceNav 等）从 `@/components/...` 改引 `@ai-todo/ui`；数据调用从直连 fetch 改 `@ai-todo/api-client`；实现 `CookieAuthStrategy`（web 端，cookie 自动携带，401 走 `/api/auth/refresh`）
7. `apps/web` 注入：在 provider/layout 层创建 `createApiClient({ baseUrl: "", authStrategy: new CookieAuthStrategy() })`，通过 Context 暴露
8. 验证 web 行为零回归：`npm run build` + `npm test` + 关键 e2e（创建任务/完成/删除/笔记/空间）

## 输入/输出契约

- **输入**：T001 产出的 `apps/web/` monorepo 结构
- **输出**：`packages/ui`（导出 10 个组件 + `index.ts`）+ `packages/api-client`（导出 `createApiClient`/`AuthStrategy`/`ApiClient`/SWR hooks/类型）+ `apps/web` 改引用 + `CookieAuthStrategy` 实现
- **下游契约（handoff 必含）**：
  - `packages/ui` 完整导出清单
  - `packages/api-client` 的 `createApiClient({ baseUrl, authStrategy })` 签名 + `ApiClient` 方法清单 + `AuthStrategy` 接口
  - 各组件的 props 回调契约（`onRefresh?`/`onNavigate?` 等）
  - mac 端实现 `BearerAuthStrategy` 需满足的 `AuthStrategy` 接口

## 验收标准

- [ ] `packages/ui` + `packages/api-client` 各自 `tsc --noEmit` rc=0
- [ ] `apps/web` `npm run build` rc=0 + `npm test` rc=0（732 用例）+ `npm run lint` rc=0
- [ ] `grep -rn 'fetch.*"/api/' packages/ui/src` 白名单外无命中（白名单：无，packages/ui 内不应有任何 fetch）
- [ ] `grep -rn 'next/navigation\|next/link\|next/headers' packages/ui/src` 无命中
- [ ] web e2e 关键路径全绿（创建/完成/删除任务、笔记 CRUD、空间切换）
- [ ] `apps/web` 行为与 T001 迁移后一致（无功能回归）
- [ ] `packages/api-client` 的 `AuthStrategy` 接口可注入（web 已注入 CookieAuthStrategy）

## 风险与注意事项

- 76 处 fetch 改写工作量最大，建议先抽 `packages/api-client`，再逐组件迁移 + 改写，每改一个跑一次测试
- `NLInput` 的 parse-task 调用是 AI 录入核心，改写后必须测真实 AI 解析流程（可能需 mock DeepSeek）
- `lib/use-tasks.ts` 的 SWR hooks 抽包后，web 端的 cache key / mutate 逻辑不能变
- 共享类型抽包后，`apps/web` 的 `lib/types.ts` 可能需 re-export 避免大量 import 改动
- `TaskDetail` 留 apps/web 但其内部也可能有直连 fetch，属可选清理（非强制）
