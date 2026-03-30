# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# AI Todo

AI 驱动的个人 Todo 工具。自然语言录入 → DeepSeek 解析 → 预览确认 → 任务管理。

## AI-First 操作原则

**NLInput（AI 输入框）是所有任务操作的主入口**，用户通过自然语言完成全部操作：

| 用户输入示例                         | 操作类型     |
| ------------------------------------ | ------------ |
| 明天下午写周报                       | 创建任务     |
| 把写报告改成高优先级                 | 更新任务     |
| 完成调研任务 / 调研搞定了            | 标记完成     |
| 删除/取消测试任务                    | 删除任务     |
| 给项目计划加进展：完成第一阶段       | 添加日报     |
| 把调研任务、接口联调移到项目计划下面 | 移动为子任务 |
| 记一下今天和客户聊了需求变更         | 创建笔记     |

新功能设计时**优先考虑 AI 输入路径**，手动 UI 操作为辅助。`parse-task` API 返回 `{ actions: ParsedAction[] }`，前端统一通过 `ActionPreview` 组件预览并执行。

## 开发命令

```bash
npm run dev    # 启动开发服务器（Turbopack）
npm run build  # 构建生产版本
npm run start  # 启动生产服务器
npm test       # 运行单元测试（Vitest，732 个用例）
npm run test:coverage  # 运行测试并生成覆盖率报告
npm run test:e2e       # 运行 E2E 测试（Playwright）
npm run lint   # ESLint 检查
npm run lint:fix  # ESLint 自动修复
npm run dead-code  # 死代码检测（Knip）
```

## 技术栈

- **框架**: Next.js 16 (App Router, Turbopack)
- **样式**: Tailwind CSS v4 + shadcn/ui (slate base)
- **数据缓存**: SWR（客户端 stale-while-revalidate 缓存）
- **认证**: user.stringzhao.life JWT 系统（`jose` + JWKS 验证）
- **AI**: DeepSeek API（自定义 fetch 客户端）
- **数据库**: Vercel Postgres（`@vercel/postgres`，表名 `ai_todo_tasks`）
- **部署**: Vercel → https://ai-todo.stringzhao.life

## 关键架构注意事项

### Next.js 16 路由保护

使用 `proxy.ts`（不是 `middleware.ts`），导出名必须为 `proxy`：

```typescript
export async function proxy(req: NextRequest) { ... }
```

### API 运行区域

- 面向中国用户，核心 API 路由（`/api/tasks`、`/api/tasks/[id]`、`/api/parse-task`）固定在 `hkg1`
- 数据库使用新加坡 Neon（`ap-southeast-1`），避免跨太平洋访问

### 认证流程

- 外部服务统一跳转 `https://user.stringzhao.life/authorize?service&return_to&state`，不直接拼接 `/login`
- 回跳页面使用 `/auth/callback`，`proxy.ts` 会校验 `state`（cookie 对比 query），并通过临时 cookie 传递原始访问路径
- `/auth/callback` 通过服务端中转 `/api/auth/exchange` 拉取 token（避免浏览器直接跨域），再通过 `/api/auth/session` 写入本域 `access_token/refresh_token`
- `proxy.ts` 在访问受保护页面/API时先校验本域 `access_token`，过期自动调用 auth 服务 `/api/auth/refresh`
- 不再在本项目内维护验证码登录页和 `/api/auth/[action]` 多 action 认证代理
- **本地开发**：`.env.local` 设置 `AUTH_DEV_BYPASS=true` + `AUTH_DEV_EMAIL` + `AUTH_DEV_USER_ID` 可跳过认证（生产环境不设置）
- **CLI 认证**：`/api/auth/cli-token` 颁发 HMAC-SHA256 签名的 `session_token`（90天有效），CLI 优先使用 `session_token` 做 Bearer 认证；`getUserFromRequest` 在 JWT 验证失败后自动回退到 session token 验证

### API 路由约定

每个 API 路由文件的标准样板：

```typescript
export const preferredRegion = "hkg1"; // 固定香港区域

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req); // 返回 { id, email } 或 null
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb(); // 幂等建表，每次请求调用
  // ...
}
```

错误响应格式统一为 `{ error: "message" }`，HTTP 码：400 输入错误、401 未授权、404 未找到、503 AI 超时。

### CLI 命令扩展原则（严格遵守）

ai-todo-cli 的所有业务命令从 `/api/manifest` 动态下发，**严禁在 CLI 中硬编码业务命令**。新增 CLI 命令的正确做法：

1. 在本项目（ai-todo 服务端）新增 API 路由
2. 在 `app/api/manifest/route.ts` 的 operations 数组中注册新操作
3. CLI 自动发现并注册命令，无需修改 CLI 代码

### Vercel Postgres 数组字段

`sql` 模板标签不支持数组类型 → 有数组字段的查询使用 `sql.query()`：

```typescript
await sql.query(`INSERT INTO ... VALUES ($1, $2, $3, $4, $5, $6)`, [userId, title, ..., tags])
```

### 环境变量

```
AUTH_ISSUER=https://user.stringzhao.life
AUTH_AUDIENCE=base-account-client
AUTH_JWKS_URL=https://user.stringzhao.life/.well-known/jwks.json
AUTH_SERVICE_ID=base-account-client
APP_ORIGIN=https://ai-todo.stringzhao.life
NEXT_PUBLIC_AUTH_ISSUER=https://user.stringzhao.life
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
STT_BASE_URL=https://api.groq.com/openai/v1  # Whisper API（兼容 OpenAI 格式）
STT_API_KEY=...                                # Groq API Key
STT_MODEL=whisper-large-v3                     # STT 模型名
POSTGRES_URL=...    # Neon DB（与 ai-news 共享，表名不同）
RESEND_API_KEY=...                                 # Resend 邮件服务 API Key
EMAIL_FROM=AI Todo <noreply@stringzhao.life>       # 发件人地址
CRON_SECRET=...                                    # Vercel Cron 认证密钥
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...                    # Web Push VAPID 公钥
VAPID_PRIVATE_KEY=...                              # Web Push VAPID 私钥
API_PROXY_URL=http://43.143.124.222:18082          # 本地 API 代理（frp 隧道）
API_PROXY_TOKEN=...                                # 代理认证 token
```

> **注意**: Vercel 上设置环境变量时用 `printf '%s'` 而非 `echo`，避免尾部换行导致 JWT 校验失败。

## 项目结构

```
app/
  (app)/                        # 路由组，共享 AppShell 布局
    layout.tsx                  # Server Component，读取 user + spaces + orgs，渲染 SpaceNav
    page.tsx                    # 今日视图
    all/page.tsx                # 全部任务视图
    notes/page.tsx              # 笔记视图（卡片时间流 + 标签筛选）
    readme/page.tsx             # 使用文档页（AI 输入示例 + 快速上手）
    spaces/
      page.tsx                  # 空间列表
      new/page.tsx              # 创建空间
      [id]/page.tsx             # 空间任务视图（进度条 + 成员筛选 + @mention + ?focus=taskId 聚焦态 + 笔记 Tab + 设置抽屉）
    orgs/
      page.tsx                  # 组织列表
      new/page.tsx              # 创建组织
      [id]/page.tsx             # 组织详情页（空间列表 + 成员管理 + 设置 Tab）
  auth/callback/page.tsx        # 统一授权回跳页（authorized/state 校验）
  shared/[code]/page.tsx        # 笔记分享公开页（独立布局，无需登录，Markdown 渲染）
  join/[invite_code]/page.tsx   # 加入空间（独立布局，无 AppShell）
  join/org/[code]/page.tsx      # 加入组织（独立布局，无 AppShell）
  api/
    auth/session/route.ts       # 写入本域 access_token/refresh_token
    auth/exchange/route.ts      # 服务端中转：转发 refresh 请求给认证服务器（避免 CORS）
    parse-task/route.ts         # AI 解析自然语言 → { actions: ParsedAction[] }（支持创建/更新/完成/删除/日报/移动，附带 tasks + parent_task 上下文）
    tasks/route.ts              # GET（列表/今日/已完成/空间/指派）+ POST（创建）
    tasks/tree/route.ts         # GET 树形文本（CLI tasks:tree，format:text → { output }）
    tasks/[id]/route.ts         # GET（单条任务）+ PATCH（完成/更新/分享/取消分享）+ DELETE
    notes/shared/[code]/route.ts  # GET 公开笔记（无需认证，按 share_code 查询）
    tasks/[id]/logs/route.ts    # GET + POST 任务进展日报
    spaces/route.ts             # GET（我的空间列表）+ POST（创建空间）
    spaces/[id]/route.ts        # GET + PATCH + DELETE
    spaces/[id]/members/route.ts          # GET 成员列表
    spaces/[id]/members/[uid]/route.ts    # PATCH（审批/更新）+ DELETE（移除/退出）
    spaces/join/[code]/route.ts           # GET 预览 + POST 加入
    spaces/[id]/join/route.ts             # POST 通过空间 ID 直接加入（空间页内加入引导用）
    orgs/route.ts                        # GET（我的组织列表）+ POST（创建组织）
    orgs/[id]/route.ts                   # GET + PATCH + DELETE
    orgs/[id]/members/route.ts           # GET 成员列表
    orgs/[id]/members/[uid]/route.ts     # PATCH（审批/改角色）+ DELETE（移除/退出）
    orgs/[id]/spaces/route.ts            # GET 组织空间列表
    orgs/[id]/spaces/[spaceId]/join/route.ts  # POST 组织成员加入空间（自动 active）
    orgs/join/[code]/route.ts            # GET 预览 + POST 加入组织
    me/summary/route.ts         # GET（缓存+配额）+ POST（流式 AI 个人每日总结）
    transcribe/route.ts         # POST 音频转文字（转发到 Whisper API）
    summarize-voice/route.ts    # POST 语音文本 AI 整理（DeepSeek 提取标题/描述/标签）
    notifications/route.ts      # GET（分页查询）+ PATCH（批量标记已读）
    notifications/unread-count/route.ts  # GET 返回 { count }
    notifications/prefs/route.ts         # GET + PUT 通知偏好
    push/vapid/route.ts         # GET 返回 VAPID 公钥
    push/subscribe/route.ts     # POST（订阅）+ DELETE（取消订阅）
    cron/daily-digest/route.ts  # Cron 每日摘要邮件（UTC 01:00 = 北京 09:00）
components/
  SpaceNav.tsx                  # 侧边栏导航（桌面）+ 底部 Tab（移动端）+ 组织区块 + 当前空间一级任务目录 + 通知铃铛
  NLInput.tsx                   # 自然语言输入框，Cmd+K 聚焦，@ 触发成员菜单，传 tasks + parent_task 上下文给 AI；聚焦态下 placeholder 提示父任务名
  ActionPreview.tsx             # 统一操作预览 + 执行（create/update/complete/delete/add_log/move）
  PeopleGantt.tsx               # 甘特图（人员维度，Y轴=人，每人一行多任务平铺）
  TaskDetail.tsx                # 任务详情编辑面板（标题 + 优先级 + 日期 + 标签 + 进度 + 负责人 + 描述 + 日志 + 完成/删除，standalone/embedded 双模式），后续任务查看和编辑统一使用此组件
  ParsePreviewCard.tsx          # AI 解析预览 + 确认创建（支持空间/负责人，单任务路径）
  MultiTaskPreview.tsx          # 多任务/层级任务预览 + 批量创建（先建父任务再建子任务）
  DateTimePicker.tsx             # 日期时间选择器（Popover 日历 + 时间输入 + 快捷按钮）
  TaskItem.tsx                  # 单条任务行（内联编辑 + 键盘导航 + 子任务折叠展开）
  TaskList.tsx                  # 任务列表（buildTree 组装父子关系 + 骨架屏 + 已完成折叠）
  NoteCard.tsx                  # 笔记卡片（标题 + 标签 + 时间 + 内联编辑 + Markdown 渲染 + 分享/取消分享）
  AssigneeBadge.tsx             # 显示非自己的负责人徽章
  AssigneePicker.tsx            # 统一经办人选择器（最近使用 + 文字过滤 + 键盘导航 + 方向自适应）
  TaskSkeleton.tsx              # 加载骨架屏（3 行）
  SpaceSettings.tsx             # 空间设置面板（Sheet 抽屉内容：邀请链接 + 所属组织 + 成员管理 + 归档 + 解散）
  DailySummary.tsx              # AI 总结面板（流式生成 + 多模板 Tab + 缓存 + 配额 + 转为笔记）
  PersonalDailySummary.tsx      # 个人每日总结（折叠面板 + 流式 AI 总结 + 缓存 + 配额 + 保存为笔记）
  SummarySettings.tsx           # AI 总结设置（模板管理 + 关联空间 toggle + 外部数据源 + AI 配置助手 + 总结预览）
  ConfigActionPreview.tsx       # AI 配置操作预览（展示解析出的配置变更列表 + 确认执行）
  SpaceNotes.tsx                # 空间笔记面板（space_id 过滤 + 内联创建 + 标签筛选 + 日期分组）
  EmptyState.tsx                # 空状态展示组件
  (已删除 NotificationBell.tsx，通知改为图标直接导航到 /notifications 页面)
  NotificationList.tsx          # 通知列表（Popover / 全屏页共用）+ 任务/摘要抽屉展示
  NotificationItem.tsx          # 单条通知行（任务/摘要通知渲染为 button + onOpenDetail，其他保留 Link）
  NotificationSettings.tsx      # 通知偏好设置（应用内 + 邮件 + 推送开关矩阵）
  PushPromptBanner.tsx          # 推送提醒横幅（访问 3 次后智能提示开启推送）
  PWAInstallBanner.tsx          # PWA 安装引导横幅（访问 5 次后提示添加到主屏幕，Chrome 一键安装 / iOS 步骤引导）
  VoiceButton.tsx               # 语音按钮组件（idle/recording/transcribing 三态 UI）
  ServiceWorkerRegistrar.tsx    # Service Worker 注册（app 加载时自动注册）
lib/
  types.ts                      # Task、ParsedTask、ParsedAction、ActionResult、TaskLog、AppNotification、SummaryConfig、LinkedSpace、Organization、OrgMember 等接口
  llm-client.ts                 # DeepSeek 客户端（55s 超时，AbortError 兜底）
  task-utils.ts                 # 纯函数：buildTree（flat Task[] → 树形 TaskNode[]）
  use-tasks.ts                  # SWR 数据缓存 hooks（useTasks/useCompletedTasks/useNotes/mutateTasks）
  date-utils.ts                 # 纯函数：formatDateTime / toLocalISO / extractTime / extractDate / DateField 类型
  gantt-utils.ts                # 纯函数：daysBetween / addDays / formatAxisDate / getMemberName
  parse-utils.ts                # 纯函数：parseItem / parseActions / cleanupCache（可测试）
  route-timing.ts               # API 路由计时工具（createRouteTimer）
  use-voice-input.ts            # 语音输入 hook（Web Speech API 优先 + Whisper fallback）
  use-voice-note.ts             # 语音笔记 hook（录音 → 转写 → AI 整理 → 创建笔记）
  note-utils.ts                 # 纯函数：extractTags / groupNotesByDate
  assignee-utils.ts             # 纯函数：getRecentAssignees / addRecentAssignee / sortMembers（localStorage 最近经办人）
  auth.ts                       # JWT 验证（jose + JWKS）+ DEV_BYPASS 模式
  auth-config.ts                # 统一授权配置（authorize/callback）
  server-auth.ts                # Server Component 用 getServerUser()
  spaces.ts                     # 空间权限工具（requireSpaceMember/Owner）
  orgs.ts                       # 组织权限工具（requireOrgMember/Owner/AdminOrOwner）
  notifications.ts              # 通知 CRUD + 偏好管理（createNotification/fireNotification 等）
  notification-types.ts         # 通知类型枚举 + 默认偏好配置
  use-notifications.ts          # 客户端轮询 hook（30s 拉 unread-count）
  email.ts                      # Resend 邮件客户端（sendNotificationEmail / sendDigestEmail）
  email-templates.ts            # 邮件 HTML 模板（通知 + 每日摘要）
  daily-digest.ts               # 每日摘要数据查询 + 内容组装
  notification-utils.ts         # 通知工具函数（getNotificationUrl 统一链接计算）
  push.ts                       # Web Push 服务端推送（sendPushToUser、VAPID 配置）
  use-push.ts                   # 客户端推送订阅 hook（subscribeToPush、unsubscribeFromPush）
  use-pwa-install.ts            # PWA 安装能力 hook（平台检测 + beforeinstallprompt 管理）
  use-media-query.ts            # 响应式 hook（useIsDesktop，768px 断点，SSR-safe）
  db.ts                         # Vercel Postgres CRUD（tasks + task_members + task_logs + push_subscriptions）；空间 = pinned 任务
  task-permissions.ts            # 任务粒度权限矩阵（纯函数：getTaskRoles / checkTaskPermission / getDisallowedFields / TaskPermissionError）
  validations.ts                 # Zod schema（createTaskSchema + formatZodError，API 输入验证）
__tests__/
  helpers/                       # 共享测试工具（mock-auth, mock-db, fixtures, make-request）
  api/                           # API Route 验收测试（notifications, tasks, tasks/[id]）
  task-utils.test.ts            # buildTree 单元测试
  gantt-utils.test.ts           # 日期函数单元测试
  parse-utils.test.ts           # parseItem / parseActions 单元测试（含 move action）
proxy.ts                        # 路由保护（未登录重定向到 /authorize）
public/
  sw.js                         # Service Worker（push 通知 + 离线 fallback）
  manifest.json                 # PWA manifest（standalone 模式 + 苔色主题）
  offline.html                  # 离线提示页（自包含 HTML）
```

## 任务优先级

| 值  | 含义            |
| --- | --------------- |
| 0   | P0 紧急         |
| 1   | P1 高           |
| 2   | P2 普通（默认） |
| 3   | P3 低           |

## 任务状态

| 值  | 含义   |
| --- | ------ |
| 0   | 待办   |
| 2   | 已完成 |

## 记录类型

| 值  | 含义         |
| --- | ------------ |
| 0   | 任务（默认） |
| 1   | 笔记         |

笔记与任务共享 `ai_todo_tasks` 表，通过 `type` 字段区分。笔记无截止日期和优先级，给笔记加上这些属性时 AI 自动将 type 翻转为 0（任务）。

## 任务层级

- 支持任意深度嵌套（`parent_id` 指向父任务 ID）
- DB：`parent_id UUID REFERENCES ai_todo_tasks(id) ON DELETE CASCADE`（删父级联删子）
- 完成父任务：`completeTask()` 同时将所有未完成子任务标记为 `status=2`（两条 UPDATE，非事务）
- 客户端：`handleComplete/handleDelete` 用 `t.parent_id !== id` 同步移除子任务；`TaskList.buildTree()` 将 flat `Task[]` 组装为树传给 `TaskItem.subtasks`

## 项目空间（统一块模型）

空间 = `pinned=true` 的顶层任务，无独立表。任意顶层任务可通过 ⋮ 菜单「置顶到侧边栏」升级为项目空间：

- `pinned=true`：置顶到侧边栏
- `invite_code`：邀请码（pin 时自动生成 8 位随机码）
- `invite_mode`：`open`（直接加入）或 `approval`（需审批）
- `ai_todo_task_members`：成员表，`task_id` 关联置顶任务
- `space_id`：子任务指向所属空间任务 ID（denormalized 访问键）

## 任务权限模型

**组织成员隐式访问**：组织 active 成员自动拥有组织内所有空间的 `member` 角色权限（`lib/spaces.ts` 查询时检查 `ai_todo_org_members`），无需单独加入空间。直接成员的角色优先于 org 隐式 member。

空间任务基于角色的操作权限（`lib/task-permissions.ts`），个人任务仅 creator 可操作：

| 操作                  | 创建者 | 经办人 | Owner | Admin | Member |
| --------------------- | ------ | ------ | ----- | ----- | ------ |
| 改标题/优先级/类型    | ✅     | -      | ✅    | -     | -      |
| 改描述/日期/标签/进度 | ✅     | ✅     | ✅    | -     | -      |
| 改经办人              | ✅     | -      | ✅    | ✅    | -      |
| 完成/重开             | ✅     | ✅     | ✅    | -     | -      |
| 移动/删除             | ✅     | -      | ✅    | -     | -      |
| 添加日志              | ✅     | ✅     | ✅    | ✅    | ✅     |

权限校验发生在 `db.ts` 的 `updateTask/deleteTask/completeTask/reopenTask` 中，违规抛 `TaskPermissionError`，API route 返回 403。

## 色彩体系

统一使用 `documents/refs/colors.md` 定义的色彩规范，**禁止使用 Tailwind 默认颜色**（如 `bg-red-500`、`text-blue-600`）。

CSS Token 已在 `app/globals.css` 中定义，Tailwind 可直接使用：

| 语义      | Tailwind class                        | CSS 变量              | 色值         |
| --------- | ------------------------------------- | --------------------- | ------------ |
| 品牌/CTA  | `text-sage` / `bg-sage`               | `--home-accent`       | 苔 #3A7D68   |
| 品牌浅    | `text-sage-light` / `bg-sage-light`   | `--home-accent-hover` | 苔浅 #52A688 |
| 品牌淡底  | `bg-sage-mist`                        | `--home-accent-mist`  | 苔淡 #E8F2EE |
| 正文      | `text-foreground`                     | `--home-fg`           | 墨 #1A1A18   |
| 背景      | `bg-background`                       | `--home-bg`           | 纸 #F7F6F1   |
| 次级背景  | `bg-muted`                            | `--home-mist`         | 雾 #EBEBEA   |
| 辅助文字  | `text-muted-foreground`               | `--home-muted`        | 烟 #8F8F8D   |
| 标签文字  | `text-charcoal`                       | `--home-charcoal`     | 炭 #595957   |
| 警告      | `text-warning` / `bg-warning`         | `--home-warning`      | 琥 #D4920A   |
| 错误/删除 | `text-destructive` / `bg-destructive` | `--home-danger`       | 朱 #D94F3D   |
| 链接/信息 | `text-info` / `bg-info`               | `--home-info`         | 天 #3B87CC   |

## 更新日志

仅在新增**大功能或重要特性**时才更新 `lib/changelog.ts`，小修复、UI 微调、性能优化等不记录。

- 数据文件：`lib/changelog.ts`，硬编码 `ChangelogEntry[]` 数组
- 新版本条目插入数组最前面（倒序排列）
- 版本号递增规则：新功能 minor+1
- 侧边栏红点依赖 `getLatestVersion()` 与 localStorage 对比，版本号变更即触发红点
