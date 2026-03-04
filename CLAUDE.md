# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# AI Todo

AI 驱动的个人 Todo 工具。自然语言录入 → DeepSeek 解析 → 预览确认 → 任务管理。

## AI-First 操作原则

**NLInput（AI 输入框）是所有任务操作的主入口**，用户通过自然语言完成全部操作：

| 用户输入示例 | 操作类型 |
|------------|---------|
| 明天下午写周报 | 创建任务 |
| 把写报告改成高优先级 | 更新任务 |
| 完成调研任务 / 调研搞定了 | 标记完成 |
| 删除/取消测试任务 | 删除任务 |
| 给项目计划加进展：完成第一阶段 | 添加日报 |

新功能设计时**优先考虑 AI 输入路径**，手动 UI 操作为辅助。`parse-task` API 返回 `{ actions: ParsedAction[] }`，前端统一通过 `ActionPreview` 组件预览并执行。

## 开发命令

```bash
npm run dev    # 启动开发服务器（Turbopack）
npm run build  # 构建生产版本
npm run start  # 启动生产服务器
npm test       # 运行单元测试（Vitest，54 个用例）
```

## 技术栈

- **框架**: Next.js 16 (App Router, Turbopack)
- **样式**: Tailwind CSS v4 + shadcn/ui (slate base)
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

### API 路由约定
每个 API 路由文件的标准样板：
```typescript
export const preferredRegion = "hkg1";  // 固定香港区域

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);  // 返回 { id, email } 或 null
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();  // 幂等建表，每次请求调用
  // ...
}
```
错误响应格式统一为 `{ error: "message" }`，HTTP 码：400 输入错误、401 未授权、404 未找到、503 AI 超时。

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
POSTGRES_URL=...    # Neon DB（与 ai-news 共享，表名不同）
```

> **注意**: Vercel 上设置环境变量时用 `printf '%s'` 而非 `echo`，避免尾部换行导致 JWT 校验失败。

## 项目结构

```
app/
  (app)/                        # 路由组，共享 AppShell 布局
    layout.tsx                  # Server Component，读取 user + spaces，渲染 SpaceNav
    page.tsx                    # 今日视图
    all/page.tsx                # 全部任务视图
    spaces/
      page.tsx                  # 空间列表
      new/page.tsx              # 创建空间
      [id]/page.tsx             # 空间任务视图（进度条 + 成员筛选 + @mention）
      [id]/settings/page.tsx    # 空间设置（邀请链接 + 成员管理 + 解散）
  auth/callback/page.tsx        # 统一授权回跳页（authorized/state 校验）
  join/[invite_code]/page.tsx   # 加入空间（独立布局，无 AppShell）
  api/
    auth/session/route.ts       # 写入本域 access_token/refresh_token
    auth/exchange/route.ts      # 服务端中转：转发 refresh 请求给认证服务器（避免 CORS）
    parse-task/route.ts         # AI 解析自然语言 → { actions: ParsedAction[] }（支持创建/更新/完成/删除/日报，附带 tasks 上下文）
    tasks/route.ts              # GET（列表/今日/已完成/空间/指派）+ POST（创建）
    tasks/[id]/route.ts         # PATCH（完成/更新）+ DELETE
    tasks/[id]/logs/route.ts    # GET + POST 任务进展日报
    spaces/route.ts             # GET（我的空间列表）+ POST（创建空间）
    spaces/[id]/route.ts        # GET + PATCH + DELETE
    spaces/[id]/members/route.ts          # GET 成员列表
    spaces/[id]/members/[uid]/route.ts    # PATCH（审批/更新）+ DELETE（移除/退出）
    spaces/join/[code]/route.ts           # GET 预览 + POST 加入
components/
  SpaceNav.tsx                  # 侧边栏导航（桌面）+ 底部 Tab（移动端）
  NLInput.tsx                   # 自然语言输入框，Cmd+K 聚焦，@ 触发成员菜单，传 tasks 上下文给 AI
  ActionPreview.tsx             # 统一操作预览 + 执行（create/update/complete/delete/add_log）
  GanttChart.tsx                # 甘特图（纯 CSS，按优先级着色，today 参考线，未排期列表）
  TaskDetail.tsx                # 任务详情内联面板（描述编辑 + 日期 + 进展评论流）
  ParsePreviewCard.tsx          # AI 解析预览 + 确认创建（支持空间/负责人，单任务路径）
  MultiTaskPreview.tsx          # 多任务/层级任务预览 + 批量创建（先建父任务再建子任务）
  TaskItem.tsx                  # 单条任务行（内联编辑 + 键盘导航 + 子任务折叠展开）
  TaskList.tsx                  # 任务列表（buildTree 组装父子关系 + 骨架屏 + 已完成折叠）
  AssigneeBadge.tsx             # 显示非自己的负责人徽章
  TaskSkeleton.tsx              # 加载骨架屏（3 行）
  EmptyState.tsx                # 空状态展示组件
lib/
  types.ts                      # Task、ParsedTask、ParsedAction、ActionResult、TaskLog 等接口
  llm-client.ts                 # DeepSeek 客户端（55s 超时，AbortError 兜底）
  task-utils.ts                 # 纯函数：buildTree（flat Task[] → 树形 TaskNode[]）
  gantt-utils.ts                # 纯函数：daysBetween / addDays / formatAxisDate / getMemberName
  parse-utils.ts                # 纯函数：parseItem / parseActions / cleanupCache（可测试）
  route-timing.ts               # API 路由计时工具（createRouteTimer）
  auth.ts                       # JWT 验证（jose + JWKS）+ DEV_BYPASS 模式
  auth-config.ts                # 统一授权配置（authorize/callback）
  server-auth.ts                # Server Component 用 getServerUser()
  spaces.ts                     # 空间权限工具（requireSpaceMember/Owner）
  db.ts                         # Vercel Postgres CRUD（tasks + spaces + members + task_logs）
__tests__/
  task-utils.test.ts            # buildTree 单元测试
  gantt-utils.test.ts           # 日期函数单元测试
  parse-utils.test.ts           # parseItem / parseActions 单元测试（54 个用例）
proxy.ts                        # 路由保护（未登录重定向到 /authorize）
```

## 任务优先级

| 值 | 含义 |
|----|------|
| 0  | P0 紧急 |
| 1  | P1 高 |
| 2  | P2 普通（默认） |
| 3  | P3 低 |

## 任务状态

| 值 | 含义 |
|----|------|
| 0  | 待办 |
| 2  | 已完成 |

## 任务层级

- 最多 2 层：顶级任务（`parent_id IS NULL`）→ 子任务（`parent_id` 指向父任务 ID）
- DB：`parent_id UUID REFERENCES ai_todo_tasks(id) ON DELETE CASCADE`（删父级联删子）
- 完成父任务：`completeTask()` 同时将所有未完成子任务标记为 `status=2`（两条 UPDATE，非事务）
- POST `/api/tasks` 携带 `parent_id` 时会校验父任务 `parent_id IS NULL`，防止超过 2 层
- 客户端：`handleComplete/handleDelete` 用 `t.parent_id !== id` 同步移除子任务；`TaskList.buildTree()` 将 flat `Task[]` 组装为树传给 `TaskItem.subtasks`
