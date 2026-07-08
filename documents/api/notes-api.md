# 笔记 API（`/api/notes/*`）

> ai-todo 笔记 API 门面,供 Mac app 等外部客户端接入。
> 对应版本:package.json `0.12.0` / changelog `1.49.0`

## 概述

笔记与任务共用 `ai_todo_tasks` 表（`type=1` 区分笔记）。本 API 是笔记的**门面层**:

- **NoteDTO 字段收窄**:仅暴露笔记语义字段(`id` / `title` / `description` / `tags` / `created_at` / `share_code` / `space_id`),屏蔽任务字段（`priority` / `status` / `due_date` / `assignee` 等）
- **type 隔离铁律**:任务（`type=0`)在笔记 API 视角等同「不存在」 → `404`(防越权访问任务,不泄漏存在性)
- **PATCH 字段收窄**:仅接受 `{title, description, tags}`,不暴露 `type` / `due_date` / `priority`,规避笔记→任务的 type 翻转（翻转实际由 AI 解析层触发,门面不提供该入口)

## Base URL

| 环境     | URL                               | 状态                                   |
| -------- | --------------------------------- | -------------------------------------- |
| 开发联调 | `http://43.143.124.222:3002`      | ✅ 当前可用（腾讯云 VPS IP + 非标端口) |
| 生产     | `https://ai-todo.stringzhao.life` | ⏳ 备案通过后启用（DNS + Caddy HTTPS)  |

> Mac app 上线**必须 HTTPS**。生产域名在 `stringzhao.life` 备案通过后启用;备案前用 `IP:3002` 开发联调。

## 鉴权

除 `GET /api/notes/shared/{code}`(公开)外,所有端点需鉴权:

**Bearer session_token**(Mac app / CLI 推荐):

- 由 `/api/auth/cli-token` 颁发(HMAC-SHA256 签名,\*\*90 天有效`)
- 请求头:`Authorization: Bearer <session_token>`

**浏览器 cookie**:web 端登录态（自动带 cookie)。

无 / 失效 → `401 { "error": "Unauthorized" }`。

### 获取 session_token

```bash
# 1. 浏览器登录 ai-todo(走 OAuth → 写本域 access_token cookie)
# 2. 用 access_token cookie 换 session_token
curl -b "access_token=<access_token_jwt>" http://<base>/api/auth/cli-token
# 响应: { "access_token": "...", "session_token": "...", "user_id": "...", "email": "..." }
# 3. 之后用 session_token 做 Bearer 调笔记 API(90 天免重新登录)
```

> `/api/notes/*` **不在** proxy.ts 的 `protectedApiPaths` 白名单（因 `shared/{code}` 必须公开),鉴权下沉到路由层 `getUserFromRequest`（支持 Bearer JWT → session_token 回退 → cookie 三通道)。这是有意设计,非遗漏。

## 通用约定

### NoteDTO

```jsonc
{
  "id": "88661616-9d90-4da2-9f51-d6e1b902198a", // uuid
  "title": "会议纪要",
  "description": "讨论了 v2 路线图...", // string | null
  "tags": ["#工作", "#会议"], // string[]
  "created_at": "2026-07-08T15:12:29.877Z", // ISO 8601
  "share_code": "a01r5al9", // string | null(分享码,8 位)
  "space_id": null, // string | null(Phase 1 恒 null)
}
```

**Phase 1**（个人笔记):`space_id` 恒为 `null`。多人共享（空间笔记)留 Phase 2。

**禁止暴露字段**（门面收窄,响应永不出现):`priority` / `status` / `due_date` / `start_date` / `end_date` / `assignee_id` / `assignee_email` / `mentioned_emails` / `progress` / `sort_order` / `milestone` / `type`。

### 错误响应

统一格式:`{ "error": "<message>" }`

| HTTP  | 含义     | 触发                                                                  |
| ----- | -------- | --------------------------------------------------------------------- |
| `400` | 输入错误 | 缺 title / trim 后空 / 超 500 字 / PATCH 无可更新字段                 |
| `401` | 未授权   | 无 / 失效 token                                                       |
| `404` | 未找到   | 他人笔记 / 不存在 id / **任务 id（type=0)经笔记 API 访问** → 统一 404 |

> 归属不匹配一律 `404`（非 403),防存在性枚举。

### 分页（游标)

复合游标 `(created_at DESC, id DESC)`:

| query 参数 | 类型                             | 默认 | 说明                             |
| ---------- | -------------------------------- | ---- | -------------------------------- |
| `cursor`   | string（Base64 `created_at\|id`) | 无   | 上一页响应的 `next_cursor`       |
| `limit`    | int                              | 20   | **1 ≤ limit ≤ 50**(自动钳制)     |
| `tag`      | string                           | 无   | 标签精确过滤                     |
| `q`        | string                           | 无   | title / description 模糊（ILIKE) |

响应:`{ items: NoteDTO[], total: int, has_more: boolean, next_cursor: string|null }`。`next_cursor` 为 `null` 表末页。

---

## 端点

### 1. 列表 `GET /api/notes`

分页查询当前用户的个人笔记。

```bash
curl -H "Authorization: Bearer <session_token>" \
  "http://<base>/api/notes?limit=10&tag=%23%E5%B7%A5%E4%BD%9C"
```

**200 响应**:

```json
{
  "items": [
    {
      "id": "...",
      "title": "...",
      "description": null,
      "tags": [],
      "created_at": "...",
      "share_code": null,
      "space_id": null
    }
  ],
  "total": 42,
  "has_more": true,
  "next_cursor": "MjAyNi0wNy0wOFQxNTowOToyOS45OTlafDg4NjYxNjE2..."
}
```

翻页:`GET /api/notes?cursor=<next_cursor>&limit=10`。

### 2. 创建 `POST /api/notes`

```bash
curl -X POST -H "Authorization: Bearer <session_token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"今天和客户聊了需求变更","tags":["#客户","#需求"]}' \
  http://<base>/api/notes
```

**请求体**:

| 字段          | 类型     | 必填 | 约束                    |
| ------------- | -------- | ---- | ----------------------- |
| `title`       | string   | ✅   | trim 后 `1 ≤ len ≤ 500` |
| `description` | string   | ❌   | —                       |
| `tags`        | string[] | ❌   | —                       |

**201 响应**:NoteDTO。

**400**:`{ "error": "title required (1-500 chars after trim)" }`。

### 3. 单条 `GET /api/notes/{id}`

```bash
curl -H "Authorization: Bearer <session_token>" http://<base>/api/notes/88661616-...
```

**200**:NoteDTO。**404**:不存在 / 他人笔记 / 任务 id（type=0)。

### 4. 更新 `PATCH /api/notes/{id}`

```bash
curl -X PATCH -H "Authorization: Bearer <session_token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"更新标题","tags":["#新标签"]}' \
  http://<base>/api/notes/88661616-...
```

**请求体**（至少 1 个）:`{ title?, description?, tags? }`。**不接受** `type` / `due_date` / `priority`（传了也被忽略,防翻转)。

**200**:更新后的 NoteDTO。**400**:`{ "error": "No updatable fields" }`。**404**:不存在 / 他人笔记。

### 5. 删除 `DELETE /api/notes/{id}`

```bash
curl -X DELETE -H "Authorization: Bearer <session_token>" http://<base>/api/notes/88661616-...
```

**200**:`{ "ok": true }`。**404**:不存在 / 他人笔记。

### 6. 生成分享 `POST /api/notes/{id}/share`

生成（或复用已有)分享码,得到公开访问 URL。

```bash
curl -X POST -H "Authorization: Bearer <session_token>" \
  http://<base>/api/notes/88661616-.../share
```

**200**:`{ "share_code": "a01r5al9", "share_url": "https://ai-todo.stringzhao.life/shared/a01r5al9" }`。

- 幂等:已有 `share_code` 则复用,不重复生成
- `share_code` 8 位（小写字母+数字)
- `share_url = ${APP_ORIGIN}/shared/${share_code}`（开发环境 `APP_ORIGIN` 可能空,看 `share_url` 的 `/shared/{code}` 后缀)

### 7. 取消分享 `DELETE /api/notes/{id}/share`

```bash
curl -X DELETE -H "Authorization: Bearer <session_token>" \
  http://<base>/api/notes/88661616-.../share
```

**200**:`{ "ok": true }`。原 `share_code` 立即失效（`/shared/{code}` 再访问 → 404)。

### 8. 公开访问 `GET /api/notes/shared/{code}`（无鉴权)

任何人凭分享码查看笔记公开内容。

```bash
curl http://<base>/api/notes/shared/a01r5al9
```

**200**:**公开子集**（屏蔽 `id` / `share_code` / `space_id` 防枚举):

```json
{ "title": "...", "description": "...", "tags": [], "created_at": "..." }
```

**404**:code 不存在 / 已取消分享。

---

## 完整流程示例（Mac app 记一条笔记)

```bash
BASE="http://43.143.124.222:3002"
TOKEN="<session_token>"

# 1. 创建
NOTE=$(curl -sX POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"调研 Apple Intelligence SDK","tags":["#调研","#Mac"]}' \
  $BASE/api/notes)
ID=$(echo $NOTE | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')

# 2. 列表（确认写入)
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/notes?limit=5" | jq '.items[].title'

# 3. 追加内容
curl -sX PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"description":"调用 NSUbentity..."}' $BASE/api/notes/$ID

# 4. 分享给同事
curl -sX POST -H "Authorization: Bearer $TOKEN" $BASE/api/notes/$ID/share
# → { share_code, share_url }
```

## 设计说明

- **type 隔离**:笔记 API 所有查询强制 `AND type = 1`。任务（type=0)的 id 经笔记 API 访问,等同「不存在」→ 404。防越权读取 / 改 / 删任务。
- **翻转规避**:CLAUDE.md 规则「给笔记加任务属性（priority/due_date)→ type 自动翻转为任务」。笔记门面 PATCH **只收** `{title, description, tags}`,不提供 priority/due_date/type 入口,故笔记经门面永远保持 type=1。
- **归属判定**:`getNote(id)` 返回 `{note, user_id}`,路由层比 `user_id === 当前用户`,不匹配 → 404。
- **preferredRegion**:所有 `/api/notes/*` 路由声明 `hkg1`（VPS 部署忽略,仅 Vercel 用)。

## 相关

- OpenAPI 规范（可生成 SDK / 文档):[`openapi.yaml`](./openapi.yaml)
- 认证服务（OAuth / cli-token):`https://user.stringzhao.life`
- 容器状态:`http://43.143.124.222:3002`（VPS ai-todo 容器,3002 端口)
