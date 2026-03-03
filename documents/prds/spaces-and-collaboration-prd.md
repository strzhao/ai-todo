# AI Todo — 项目空间与协作功能 PRD

| 字段 | 内容 |
|------|------|
| 版本 | v0.1 |
| 状态 | 草稿 |
| 创建日期 | 2026-03-03 |
| 最后更新 | 2026-03-03 |
| 关联文档 | [Phase 0 PRD](./ai-todo-prd.md) |

---

## 目录

1. [背景与目标](#1-背景与目标)
2. [功能概述](#2-功能概述)
3. [功能一：任务 @人](#3-功能一任务-人)
4. [功能二：项目空间](#4-功能二项目空间)
5. [功能三：交互优化](#5-功能三交互优化)
6. [数据模型变更](#6-数据模型变更)
7. [API 设计](#7-api-设计)
8. [页面与路由结构](#8-页面与路由结构)
9. [关键用户流程](#9-关键用户流程)
10. [权限矩阵](#10-权限矩阵)
11. [分阶段交付计划](#11-分阶段交付计划)
12. [验收标准](#12-验收标准)

---

## 1. 背景与目标

### 1.1 背景

AI Todo Phase 0 MVP 已上线，完成了核心闭环：自然语言录入 → AI 解析 → 预览确认 → 个人任务管理。
当前产品是严格的单用户工具，所有任务只有自己可见、自己管理。

随着使用深入，出现两类新需求：

**协作需求**：用户希望能把任务指派给他人，或者和团队共同维护一个项目的任务池。
**体验需求**：现有双视图（今日/全部）的导航和操作细节存在改进空间，如缺少已完成任务回顾、无内联编辑、移动端体验薄弱。

### 1.2 目标

| 目标 | 衡量方式 |
|------|---------|
| 支持任务指派（@人） | 空间内创建任务时可指定负责人，被指派人在"指派给我"视图中能看到 |
| 支持共享项目空间 | 用户可创建空间并通过链接邀请他人，空间内任务协同管理 |
| 改善页面交互体验 | 新增内联编辑、已完成回顾、键盘导航、全局侧边栏导航 |

### 1.3 约束

- **Auth 限制**：JWT 仅提供 `{ id, email }`，无 username 系统 → @mention 句柄使用 email
- **向后兼容**：所有 schema 变更必须向后兼容，现有任务数据不受影响
- **部署环境**：Vercel + Neon Postgres，API 固定 `hkg1` 区域

---

## 2. 功能概述

### 2.1 三大新功能

```
┌─────────────────────────────────────────────────────┐
│                   AI Todo                           │
│                                                     │
│  个人空间（原有）          项目空间（新增）           │
│  ┌──────────────┐         ┌──────────────────────┐  │
│  │ 今日任务      │         │  空间 A: 前端项目     │  │
│  │ 全部任务      │         │  空间 B: 2026 OKR    │  │
│  │              │         │  空间 C: 家庭计划     │  │
│  └──────────────┘         └──────────────────────┘  │
│                                                     │
│  任务 @人：无 @mention → 自己；@email → 指定成员   │
│  交互优化：侧边栏、内联编辑、键盘导航、已完成回顾   │
└─────────────────────────────────────────────────────┘
```

### 2.2 功能优先级

| 功能 | 优先级 | 阶段 |
|------|--------|------|
| 交互优化（无 schema 变更） | P0 | Phase A |
| 任务 @人（加列，向后兼容） | P0 | Phase B |
| 项目空间完整功能 | P1 | Phase C |

---

## 3. 功能一：任务 @人

### 3.1 核心逻辑

```
用户输入自然语言
    │
    ├── 包含 @mention（如 @alice@company.com）
    │       ├── 在空间上下文 → 解析为 assignee，关联到空间成员
    │       └── 在个人上下文 → 存储为注释元数据（非功能性，备未来通知用）
    │
    └── 不包含 @mention
            └── assignee = 当前用户（自我指派，默认行为）
```

### 3.2 AI 解析扩展

**新增输出字段**：
- `assignee?: string` — 被指派人邮箱（取第一个 @mention，或 null）
- `mentions?: string[]` — 所有 @提及邮箱列表

**输入示例**：
```
"@bob@example.com 帮我看一下这个需求文档，明天前给我 review 意见，高优"
```

**解析输出**：
```json
{
  "title": "review 需求文档",
  "assignee": "bob@example.com",
  "mentions": ["bob@example.com"],
  "due_date": "2026-03-04",
  "priority": 1
}
```

**个人上下文输入示例**：
```
"明天下午提醒 @自己 买菜"
```

**解析输出**：
```json
{
  "title": "买菜",
  "assignee": null,
  "due_date": "2026-03-04T14:00:00"
}
```
（无空间上下文时 @自己 / 无 @mention 均等价于 assignee = 当前用户）

### 3.3 UI 交互

**NLInput 组件**（仅在空间上下文中启用）：
- 用户输入 `@` 字符时，弹出成员选择菜单
- 菜单展示：display_name（若有）+ email，支持输入过滤
- 选中后自动插入 `@email` 到输入框光标处

**ParsePreviewCard 组件**：
- 新增"负责人"行：展示 assignee 邮箱或 display_name
- 无 assignee 时展示"我（默认）"

**TaskItem 组件**：
- 仅当 `assignee_email ≠ current_user_email` 时展示 `AssigneeBadge`
- Badge 展示：头像首字母圆圈 + display_name/email

### 3.4 "指派给我"视图

路由：`/all?filter=assigned`

展示跨所有空间和个人任务中 `assignee_id = current_user_id` 的任务，
附带来源标注（来自哪个空间或"个人"）。

---

## 4. 功能二：项目空间

### 4.1 概念定义

**项目空间（Space）**：由用户创建的共享工作区。
- 有唯一名称和可选描述
- 成员通过邀请链接加入
- 空间内所有任务对全体成员可见、可管理
- 个人任务（无 space_id）始终私密，不受影响

**成员角色**：

| 角色 | 权限 |
|------|------|
| `owner`（创建者）| 全部权限，包括管理成员、修改/解散空间 |
| `member`（普通成员） | 查看、创建、编辑、完成任务；不可管理空间 |

**加入模式**：

| 模式 | 说明 |
|------|------|
| `open`（默认）| 持有邀请链接直接加入，即时生效 |
| `approval` | 持有链接提交申请，owner 审批后生效 |

### 4.2 空间生命周期

```
创建空间 → 系统生成邀请链接
    │
    └── 分享链接给他人
            │
            ├── open 模式 → 访问链接 → 确认 → 立即加入
            └── approval 模式 → 访问链接 → 申请 → owner 审批 → 加入
                                                        │
                                                      拒绝 → 申请失败

成员在空间内创建/管理任务（协同可见）

解散空间：
  - 所有任务 space_id 置为 NULL（变为各自的个人任务，不删除数据）
  - 成员关系删除
```

### 4.3 邀请链接

格式：`https://ai-todo.stringzhao.life/join/[8位随机串]`

示例：`https://ai-todo.stringzhao.life/join/x7k3m9pq`

- 邀请码为 8 位大小写字母+数字随机串（`crypto.randomBytes`）
- 邀请码永久有效（Phase 1 不做过期，可在设置中手动重置）
- 未登录用户访问 `/join/xxx` → 先跳转登录 → 登录后自动跳回

### 4.4 空间任务视图

路由：`/spaces/[id]`

```
┌─ 空间名称 ─────────────────────────────────────────┐
│ 任务进度: ████████░░  8/10 完成                    │
│                                                   │
│ [成员筛选: 全部 | 我的 | @bob | @alice]            │
│                                                   │
│ ● P0  需求文档 review          负责: @bob  明天   │
│ ● P1  接口联调                  负责: 我    今天   │
│ ● P2  更新部署文档              负责: @alice 本周  │
│                                                   │
│ ┌─ NLInput: "明天 @bob review 一下 API 文档..." ─┐  │
│ │                            [AI 解析] Cmd+Enter │  │
│ └──────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┘
```

---

## 5. 功能三：交互优化

### 5.1 全局导航重构

**当前**：每个页面独立内联导航 Tab，移动端无专属处理。

**方案**：提取 `AppShell` 组件，统一导航入口。

**桌面端（≥768px）侧边栏**：

```
┌────────────────────────────────────┐
│  AI Todo                 [新建任务] │
├──────────────────┬─────────────────┤
│ 个人             │                 │
│  今日任务   ●    │  任务内容区域   │
│  全部任务        │                 │
│  指派给我        │                 │
│                  │                 │
│ 项目空间    [+]  │                 │
│  前端项目        │                 │
│  2026 OKR        │                 │
│  家庭计划        │                 │
│                  │                 │
├──────────────────┤                 │
│  user@email.com  │                 │
└──────────────────┴─────────────────┘
```

**移动端（<768px）底部 Tab**：

```
┌──────────────────────────────────┐
│           任务内容区域           │
│                                  │
├──────────────────────────────────┤
│  [今日]   [全部]   [空间]        │
└──────────────────────────────────┘
```

### 5.2 已完成任务回顾

**当前**：`getTasks` 过滤 `status != 2`，已完成任务对用户不可见。

**方案**：列表底部增加折叠区域。

```
┌── 待办任务 (3) ──────────────────────┐
│ ● 接口联调         今天              │
│ ● 更新文档         明天              │
│ ● 季度报告         本周五            │
│                                     │
│ ── ✓ 已完成 (5) ▼ ──────────────── │
│  （点击展开，展示最近 20 条）        │
│  ✓ 需求 review           3 小时前   │
│  ✓ 修复登录 bug          昨天       │
└─────────────────────────────────────┘
```

- 默认折叠，点击展开
- 最多展示最近 20 条已完成任务，按 `completed_at DESC` 排序
- 展开后可再次完成任务（误点撤回）

### 5.3 内联编辑

**当前**：任务标题无法直接编辑，须删除重建。

**方案**：单击任务标题进入编辑模式。

```
交互：
  单击标题 → <input> 聚焦（保留原内容）
  按 Enter / 失去焦点 → PATCH /api/tasks/[id] 保存
  按 Esc → 恢复原内容，退出编辑

视觉：
  编辑中：标题变为带边框 input，底部蓝色边线提示
  保存中：短暂 loading 态（防止重复提交）
  保存成功：无动画（减少干扰）
  保存失败：红色边线 + toast 提示
```

### 5.4 键盘导航

| 快捷键 | 说明 |
|--------|------|
| `↑` / `↓` | 在任务列表中移动焦点 |
| `Space` | 完成/取消完成当前聚焦任务 |
| `Enter` | 进入当前任务标题内联编辑 |
| `Esc` | 退出编辑模式 |
| `Delete` / `Backspace` | 删除当前任务（二次确认） |
| `Cmd+Enter` | 触发 NLInput AI 解析（已有，保留） |
| `Cmd+K` | 聚焦 NLInput 输入框（新增） |

### 5.5 骨架屏与空状态

**加载中**：用骨架屏替代 "加载中..." 文字。

```
┌── 今日待办 ────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░   P1  今天 │
│ ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░   P2  明天 │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░   P0  今天 │
└────────────────────────────────┘
```

**空状态**（无任务时）：

```
┌──────────────────────────────────┐
│                                  │
│         ✓  全部搞定了！           │
│    今天没有待办任务，休息一下？    │
│                                  │
│    [+ 新建任务]                  │
└──────────────────────────────────┘
```

### 5.6 进度指示

仅在**项目空间视图**顶部展示：

```
任务进度  ████████░░░░  8 / 12 已完成（67%）
```

- 数据由前端从任务列表计算（不额外 API 请求）
- 仅统计当前筛选条件下的任务（全部成员 or 某个成员）

### 5.7 移动端手势

**TaskItem 滑动操作**：
- 右滑（向右）→ 绿色背景 + ✓ 图标 → 松手完成任务
- 左滑（向左）→ 红色背景 + 🗑 图标 → 松手删除任务（有确认动效）
- 滑动距离 < 50px → 自动回弹，无操作

---

## 6. 数据模型变更

### 6.1 新增表：`ai_todo_spaces`

```sql
CREATE TABLE IF NOT EXISTS ai_todo_spaces (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  owner_id     TEXT NOT NULL,
  owner_email  TEXT NOT NULL,
  invite_code  TEXT UNIQUE NOT NULL,
  invite_mode  TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'approval'
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spaces_owner      ON ai_todo_spaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_spaces_invite     ON ai_todo_spaces(invite_code);
```

### 6.2 新增表：`ai_todo_space_members`

```sql
CREATE TABLE IF NOT EXISTS ai_todo_space_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id     UUID NOT NULL REFERENCES ai_todo_spaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  email        TEXT NOT NULL,
  display_name TEXT,
  role         TEXT NOT NULL DEFAULT 'member',   -- 'owner' | 'member'
  status       TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'pending'
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(space_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_members_space    ON ai_todo_space_members(space_id);
CREATE INDEX IF NOT EXISTS idx_members_user     ON ai_todo_space_members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_email    ON ai_todo_space_members(space_id, email);
```

### 6.3 修改表：`ai_todo_tasks`（向后兼容 ALTER）

```sql
ALTER TABLE ai_todo_tasks
  ADD COLUMN IF NOT EXISTS space_id        UUID REFERENCES ai_todo_spaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignee_id     TEXT,
  ADD COLUMN IF NOT EXISTS assignee_email  TEXT,
  ADD COLUMN IF NOT EXISTS mentioned_emails TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_tasks_space    ON ai_todo_tasks(space_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON ai_todo_tasks(assignee_id);
```

> **注意**：`space_id = NULL` 保持个人任务的原有行为，完全向后兼容。
> `initDb()` 必须先创建 `ai_todo_spaces` 再执行 `ALTER TABLE`。

### 6.4 TypeScript 类型变更（`lib/types.ts`）

```typescript
// Task 新增字段
export interface Task {
  // ...existing fields...
  space_id?: string;
  assignee_id?: string;
  assignee_email?: string;
  mentioned_emails?: string[];
}

// ParsedTask 新增字段
export interface ParsedTask {
  // ...existing fields...
  assignee?: string;       // 被指派人邮箱
  mentions?: string[];     // 所有 @提及邮箱
}

// 新增类型
export interface Space {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  owner_email: string;
  invite_code: string;
  invite_mode: 'open' | 'approval';
  created_at: string;
  updated_at: string;
  member_count?: number;
  task_count?: number;
  my_role?: 'owner' | 'member';
}

export interface SpaceMember {
  id: string;
  space_id: string;
  user_id: string;
  email: string;
  display_name?: string;
  role: 'owner' | 'member';
  status: 'active' | 'pending';
  joined_at: string;
}
```

---

## 7. API 设计

### 7.1 现有 API 变更

#### `GET /api/tasks`

新增 query 参数：

| 参数 | 说明 |
|------|------|
| `space_id=<uuid>` | 查询指定空间任务（需为该空间成员） |
| `filter=assigned` | 跨空间"指派给我"（assignee_id = 当前用户） |
| `filter=today` | 原有，可与 space_id 组合使用 |

**访问控制**：
- 无 `space_id`：返回 `user_id = current AND space_id IS NULL`（原有行为）
- 有 `space_id`：验证成员资格，返回该空间所有非完成任务

#### `POST /api/tasks`

新增 body 字段：

```typescript
{
  // ...existing ParsedTask fields...
  space_id?: string;       // 所属空间（需为成员）
  assignee_email?: string; // 被指派人邮箱（空间模式下从成员中解析 user_id）
}
```

#### `PATCH /api/tasks/[id]`

- 个人任务：仅 `user_id` 可操作（原有）
- 空间任务：任意 active 成员可编辑；`assignee_email` 可在此修改

#### `DELETE /api/tasks/[id]`

- 个人任务：仅 `user_id`（原有）
- 空间任务：任务创建者 **或** 空间 owner 可删除

### 7.2 新增空间 API

所有空间 API 均需登录（`getUserFromRequest` 验证），返回统一格式 `{ error }` / HTTP 状态码规范与现有一致。

#### `GET /api/spaces`

返回当前用户参与的所有空间（role: owner/member，status: active）。

```typescript
// Response
Space[]  // 含 member_count, task_count, my_role
```

#### `POST /api/spaces`

```typescript
// Body
{ name: string; description?: string; invite_mode?: 'open' | 'approval' }

// Action
// 1. 生成 8 位唯一 invite_code
// 2. INSERT INTO ai_todo_spaces
// 3. INSERT INTO ai_todo_space_members (role='owner', status='active')

// Response: 201 Created
Space
```

#### `GET /api/spaces/[id]`

返回空间详情 + 成员列表（需为成员）。

```typescript
// Response
{ space: Space; members: SpaceMember[] }
```

#### `PATCH /api/spaces/[id]`

```typescript
// Body (部分更新)
{ name?: string; description?: string; invite_mode?: 'open' | 'approval' }
// Access: owner only
// Response: 200 Updated Space
```

#### `DELETE /api/spaces/[id]`

```typescript
// Action
// 1. UPDATE ai_todo_tasks SET space_id = NULL WHERE space_id = id  （保留任务）
// 2. DELETE FROM ai_todo_spaces WHERE id = id （级联删除成员）
// Access: owner only
// Response: 204 No Content
```

#### `GET /api/spaces/join/[code]`（公开，无需登录）

```typescript
// Response: 200
{ id: string; name: string; owner_email: string; member_count: number; invite_mode: string }
// Response: 404 if invite_code not found
```

#### `POST /api/spaces/join/[code]`

```typescript
// Auth: required
// Action
// - open: INSERT member status='active' → redirect to /spaces/[id]
// - approval: INSERT member status='pending' → show "等待审批"
// Response: { space_id: string; status: 'active' | 'pending' }
// 409 Conflict if already a member
```

#### `GET /api/spaces/[id]/members`

```typescript
// Access: active member only
// Response: SpaceMember[]
```

#### `PATCH /api/spaces/[id]/members/[uid]`

```typescript
// Body: { status?: 'active'; display_name?: string }
// Access: owner can approve; member can update own display_name
```

#### `DELETE /api/spaces/[id]/members/[uid]`

```typescript
// Access: owner removes anyone; member removes self (leave)
// Cannot remove the last owner
```

### 7.3 proxy.ts 变更

```typescript
// 新增保护路径
const protectedPaths = ["/", "/all", "/spaces", "/join"];
const protectedApiPaths = ["/api/tasks", "/api/parse-task", "/api/spaces"];
```

---

## 8. 页面与路由结构

### 8.1 新增路由

```
/spaces                      空间列表
/spaces/new                  创建空间表单
/spaces/[id]                 空间任务视图
/spaces/[id]/settings        空间设置（成员管理、邀请链接）
/join/[invite_code]          邀请确认页（公开）
```

### 8.2 路由组（共享布局）

使用 Next.js App Router 路由组实现共享 AppShell：

```
app/
  (app)/
    layout.tsx              ← AppShell（侧边栏 + 移动端底部 Tab）
    page.tsx                ← 今日任务
    all/page.tsx            ← 全部任务
    spaces/
      page.tsx              ← 空间列表
      new/page.tsx          ← 创建空间
      [id]/page.tsx         ← 空间任务视图
      [id]/settings/page.tsx ← 空间设置
  join/
    [invite_code]/page.tsx  ← 加入确认（独立布局，不含 AppShell）
  auth/
    callback/page.tsx       ← 原有，不变
```

### 8.3 新增组件

| 组件 | 说明 |
|------|------|
| `components/AppShell.tsx` | 全局布局（侧边栏 + 移动端 Tab） |
| `components/SpaceNav.tsx` | 侧边栏空间列表 |
| `components/AssigneeBadge.tsx` | 任务负责人头像 Badge |
| `components/MemberMentionMenu.tsx` | @mention 成员选择弹出菜单 |
| `components/SpaceSettingsPanel.tsx` | 空间管理面板 |
| `components/TaskSkeleton.tsx` | 任务列表骨架屏 |
| `components/EmptyState.tsx` | 空列表占位图 |
| `components/ProgressBar.tsx` | 空间任务进度条 |
| `lib/spaces.ts` | 空间权限检查工具函数 |

### 8.4 修改组件

| 组件 | 变更 |
|------|------|
| `components/NLInput.tsx` | 新增 `spaceId?` + `members?` props；@mention 自动补全 |
| `components/ParsePreviewCard.tsx` | 新增负责人展示行；传入 `spaceId?` |
| `components/TaskItem.tsx` | 新增 `AssigneeBadge`；内联编辑；键盘导航；移动端手势 |
| `components/TaskList.tsx` | 已完成折叠区域；groupBy/filter 支持；骨架屏接入 |
| `lib/db.ts` | `initDb()` 新增建表和 ALTER；`getTasks` 支持 `spaceId`；新增 `getTaskForUser` |
| `lib/types.ts` | 扩展 Task/ParsedTask；新增 Space/SpaceMember |
| `app/api/tasks/route.ts` | 支持 `space_id` 查询和 assignee |
| `app/api/tasks/[id]/route.ts` | 更新权限检查（空间成员可编辑） |
| `app/api/parse-task/route.ts` | 更新 system prompt 提取 @mention |
| `proxy.ts` | 新增保护路径 |

---

## 9. 关键用户流程

### 9.1 创建空间并邀请成员

```
1. 侧边栏点击"项目空间 +"
   → /spaces/new

2. 填写空间名称（必填）、描述（可选）、加入方式
   → POST /api/spaces
   → 系统生成 invite_code

3. 跳转到 /spaces/[id]
   → 顶部展示邀请链接横幅
   → 用户复制链接分享给同事

4. 同事打开链接 /join/x7k3m9pq
   → 若未登录：跳转登录 → 登录后自动回跳
   → 展示空间预览（名称、创建者、成员数）
   → 点击"加入空间"

5. open 模式：立即加入 → 跳转到 /spaces/[id]
   approval 模式：提示"申请已提交，等待审批"

6. owner 在 /spaces/[id]/settings 看到待审批成员
   → 点击"同意" → PATCH status='active'
```

### 9.2 在空间内创建指派任务

```
1. 在 /spaces/[id] 的 NLInput 中输入：
   "@bob@company.com 明天帮我 review API 文档，高优"

2. 输入 @ 时弹出成员列表：
   bob@company.com（bob）  ← 选中
   alice@example.com（alice）

3. 点击 AI 解析（或 Cmd+Enter）
   → POST /api/parse-task
   → 返回: { title: "review API 文档", assignee: "bob@company.com", priority: 1, due_date: "明天" }

4. ParsePreviewCard 展示：
   标题: review API 文档
   负责人: bob@company.com
   截止: 明天
   优先级: P1

5. 确认创建 → POST /api/tasks { space_id, assignee_email: "bob@company.com", ... }
   → 系统解析 bob 的 user_id，写入 assignee_id

6. Bob 访问 /all?filter=assigned 看到该任务（"来自：前端项目空间"）
```

### 9.3 内联编辑任务

```
1. 用户单击任务标题文字
   → 标题变为 <input>，原内容保留，光标在末尾

2. 修改内容后按 Enter
   → PATCH /api/tasks/[id] { title: "新标题" }
   → Input 变回 <span>，展示新标题

3. 按 Esc
   → 恢复原标题，不发起请求
```

### 9.4 解散空间

```
1. /spaces/[id]/settings → 危险操作区 → "解散空间"
   → 弹出确认框（需输入空间名称确认）

2. 确认后：
   → DELETE /api/spaces/[id]
   → 所有空间任务 space_id 置为 NULL（各成员在自己的个人任务列表中可见）
   → 跳转到 /spaces（空间列表）
   → 提示：已解散，原任务已归还到各成员个人任务中
```

---

## 10. 权限矩阵

### 任务权限

| 操作 | 个人任务 | 空间任务（普通成员） | 空间任务（owner） |
|------|---------|---------------------|-----------------|
| 查看 | 仅自己 | 全体成员 | 全体成员 |
| 创建 | 自己 | 全体成员 | 全体成员 |
| 编辑标题/字段 | 仅自己 | 全体成员 | 全体成员 |
| 修改负责人 | 不适用 | 全体成员 | 全体成员 |
| 完成 | 仅自己 | 全体成员 | 全体成员 |
| 删除 | 仅自己 | 仅创建者 | 任意任务 |

### 空间权限

| 操作 | 普通成员 | Owner |
|------|---------|-------|
| 查看空间信息 | ✓ | ✓ |
| 查看成员列表 | ✓ | ✓ |
| 修改空间名称/描述 | ✗ | ✓ |
| 修改邀请方式 | ✗ | ✓ |
| 审批待定成员 | ✗ | ✓ |
| 移除成员 | ✗ | ✓ |
| 离开空间 | ✓ | ✗（需先转让或解散） |
| 解散空间 | ✗ | ✓ |

---

## 11. 分阶段交付计划

### Phase A：交互优化（零 Schema 变更）

**目标**：改善现有体验，不引入任何数据库变更，可独立发布验证。

**包含**：
- `AppShell` 组件（侧边栏 + 移动底部 Tab）
- `TaskItem` 内联编辑
- 键盘导航（`↑↓ Space Enter Esc`）
- `TaskList` 已完成折叠区域
- 骨架屏 + 空状态组件
- `Cmd+K` 聚焦 NLInput 快捷键

**不包含**：@mention、项目空间

---

### Phase B：任务 @人（向后兼容 Schema 变更）

**依赖**：Phase A 完成

**包含**：
- `ai_todo_tasks` 新增 `assignee_id`, `assignee_email`, `mentioned_emails` 三列
- 更新 `lib/types.ts`（Task、ParsedTask 新增字段）
- 更新 `/api/parse-task` system prompt（提取 @mention）
- 更新 `POST /api/tasks` 接受 `assignee_email`
- `ParsePreviewCard` 展示负责人行
- `TaskItem` 展示 `AssigneeBadge`
- `GET /api/tasks?filter=assigned` 新增"指派给我"视图
- 侧边栏新增"指派给我"入口

**不包含**：空间内 @mention 自动补全（依赖 Phase C 成员列表）

---

### Phase C：项目空间完整功能

**依赖**：Phase B 完成

**包含**：
- 新增 `ai_todo_spaces`, `ai_todo_space_members` 表
- `ai_todo_tasks` 新增 `space_id` 列
- 全部空间 API 端点
- 空间相关页面（列表、新建、任务视图、设置）
- `/join/[invite_code]` 邀请页
- `NLInput` @mention 自动补全（空间上下文）
- `proxy.ts` 新增保护路径
- `lib/spaces.ts` 权限检查工具
- 空间任务进度条
- 移动端 TaskItem 滑动手势

---

## 12. 验收标准

### Phase A — 交互优化

| ID | 验收标准 |
|----|---------|
| AC-A-01 | 桌面端（≥768px）展示侧边栏，包含"今日"、"全部"、"指派给我"入口 |
| AC-A-02 | 移动端（<768px）展示底部 Tab，三个 Tab 分别对应今日/全部/空间 |
| AC-A-03 | 任务列表底部有"显示已完成"开关，展开后展示最近 20 条完成任务 |
| AC-A-04 | 单击任务标题可进入编辑模式（变为 input），Enter/blur 保存，Esc 取消 |
| AC-A-05 | 键盘导航：↑↓ 可移动焦点，Space 完成任务，Delete 触发删除确认 |
| AC-A-06 | 任务列表加载中展示骨架屏而非文字"加载中" |
| AC-A-07 | 无任务时展示空状态图（非空白区域） |
| AC-A-08 | Cmd+K 聚焦 NLInput 输入框 |

### Phase B — 任务 @人

| ID | 验收标准 |
|----|---------|
| AC-B-01 | 自然语言含 @mention 时，AI 解析结果包含 `assignee` 字段 |
| AC-B-02 | ParsePreviewCard 展示"负责人"行（有 assignee 时） |
| AC-B-03 | 创建任务后，TaskItem 在 assignee ≠ 当前用户时展示 AssigneeBadge |
| AC-B-04 | GET /api/tasks?filter=assigned 返回 assignee_id = 当前用户的所有任务 |
| AC-B-05 | 新增列操作向后兼容：现有任务查询和创建行为不变 |

### Phase C — 项目空间

| ID | 验收标准 |
|----|---------|
| AC-C-01 | 用户可创建空间，系统生成 8 位邀请码，展示完整邀请链接 |
| AC-C-02 | open 模式：访问邀请链接 → 确认 → 立即成为成员，可访问空间任务 |
| AC-C-03 | approval 模式：访问邀请链接 → 申请 → owner 审批后生效 |
| AC-C-04 | 未登录用户访问邀请链接，先跳转登录，登录后自动回跳到邀请页 |
| AC-C-05 | 空间内任务对全体成员可见，任意成员可编辑、完成任务 |
| AC-C-06 | 个人任务（今日/全部视图）对其他成员不可见 |
| AC-C-07 | 解散空间后，空间任务转为各成员个人任务，数据不丢失 |
| AC-C-08 | 空间视图内输入 @ 触发成员选择菜单，支持按名称/邮箱过滤 |
| AC-C-09 | 空间任务视图顶部展示进度条（已完成/总数） |

---

*文档结束。如需修改或补充，请更新版本号并注明变更内容。*
