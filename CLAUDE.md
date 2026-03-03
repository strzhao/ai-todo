# AI Todo

AI 驱动的个人 Todo 工具。自然语言录入 → DeepSeek 解析 → 预览确认 → 任务管理。

## 开发命令

```bash
npm run dev    # 启动开发服务器（Turbopack）
npm run build  # 构建生产版本
npm run start  # 启动生产服务器
```

## 技术栈

- **框架**: Next.js 16 (App Router, Turbopack)
- **样式**: Tailwind CSS v4 + shadcn/ui (slate base)
- **认证**: user.stringzhao.life JWT 系统（`jose` + JWKS 验证）
- **AI**: DeepSeek API（自定义 fetch 客户端）
- **数据库**: Vercel Postgres（`@vercel/postgres`，表名 `ai_todo_tasks`）
- **部署**: Vercel → https://ai-todo-taupe.vercel.app

## 关键架构注意事项

### Next.js 16 路由保护
使用 `proxy.ts`（不是 `middleware.ts`），导出名必须为 `proxy`：
```typescript
export async function proxy(req: NextRequest) { ... }
```

### 认证流程
- 用户在 `/login` 输入邮箱 + 验证码
- `/api/auth/[action]` 代理转发到 user.stringzhao.life（仅做同源转发）
- 认证 cookie 由认证服务下发，代理透传 `Set-Cookie` 响应头
- 不再在本项目内做 `accessToken` 到 cookie 的手动转换

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
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
POSTGRES_URL=...    # Neon DB（与 ai-news 共享，表名不同）
```

> **注意**: Vercel 上设置环境变量时用 `printf '%s'` 而非 `echo`，避免尾部换行导致 JWT 校验失败。

## 项目结构

```
app/
  page.tsx                    # 今日视图（客户端组件）
  all/page.tsx                # 全部任务视图
  login/page.tsx              # 邮箱 + 验证码登录
  api/
    parse-task/route.ts       # AI 解析自然语言 → ParsedTask JSON
    tasks/route.ts            # GET（列表/今日过滤）+ POST（创建）
    tasks/[id]/route.ts       # PATCH（完成/更新）+ DELETE
    auth/[action]/route.ts    # 认证代理（send-code/verify-code/logout）
components/
  NLInput.tsx                 # 自然语言输入框，Cmd+Enter 触发
  ParsePreviewCard.tsx        # AI 解析预览 + 确认创建
  TaskItem.tsx                # 单条任务行
  TaskList.tsx                # 任务列表容器
lib/
  types.ts                    # Task、ParsedTask 接口
  llm-client.ts               # DeepSeek 客户端（改编自 ai-news）
  auth.ts                     # JWT 验证（jose + JWKS，模块级缓存）
  db.ts                       # Vercel Postgres CRUD
proxy.ts                      # 路由保护（未登录重定向到 /login）
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
