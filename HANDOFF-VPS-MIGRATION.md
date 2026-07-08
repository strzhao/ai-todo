# ai-todo VPS 迁移 Handoff

> 生成于 2026-07-08，从 little-bee 迁移会话交接。
> **目标**：把 ai-todo 迁到腾讯云 VPS + 暴露笔记 API 给新 Mac app。
> 腾讯云/VPS 凭据已追加到 `ai-todo/.env.local`（gitignored，已确认）。

---

## 0. 背景

- **为什么迁**：Vercel 国内访问不稳；且 Vercel Blob 曾因带宽超额被封（little-bee 线上图片 502）。迁国内云根治。
- **little-bee 已迁成功**：同一台 VPS、同一套流程已跑通（数据全迁 + 容器部署 + `_next/image` 从 COS 拿图验证 OK）。ai-todo 是第二个服务，**参考 `../little-bee/`**。
- **ai-todo 更简单**：无 Blob（无媒体）、无 Prisma（直接 SQL）。核心工作是 **DB 访问层重写**（`@vercel/postgres` → `pg`）。
- **笔记 API 门面已就绪**：`/api/notes/*`（个人笔记 + session_token 鉴权），Mac app 接入文档见 `documents/api/notes-api.md` + `documents/api/openapi.yaml`。

---

## 1. 环境现状（共享，已就绪）

### VPS（上海，腾讯云）

- **IP**: `43.143.124.222`，Ubuntu 24.04，2C2G + 1.9G swap，Docker 已装
- **SSH**: `ssh -i ~/.ssh/little-bee-vps ubuntu@43.143.124.222`（密钥已部署，免密）
- **已跑服务**:
  | 服务 | 容器/进程 | 端口 |
  |---|---|---|
  | little-bee | docker | 3001（内部） |
  | little-bee-pg | docker (PostgreSQL 16) | 127.0.0.1:5432 |
  | wewe-rss | docker | 4000 |
  | frps | systemd | **80**/7500/18080-2 |
- **ai-todo 端口规划**: **3002**（3001 被 little-bee 占）

### PostgreSQL（共享实例）

- `little-bee-pg` 容器，user `littlebee`，密码见 `.env.local` `VPS_PG_SUPERUSER_PASSWORD`
- 已有 DB：`littlebee`（little-bee 用）
- **ai-todo 用独立 DB `ai_todo`**（同实例，省内存，数据隔离）

### 备案

- `stringzhao.life` 主域 **已提交备案审核**（1–3 周）
- 通过后 `ai-todo.stringzhao.life` 子域直接可用（主域备案覆盖所有子域）
- **备案前**：用 IP + 非标端口开发测试
- **备案后**：域名 + Caddy HTTPS 正式发布（Mac app 上线必须 HTTPS）

### frps 占用 80 ⚠️

- `frps.toml` 的 `vhostHTTPPort=80`，与 web/API 的 80/443 冲突
- **上线前**（备案通过后）：改 `/etc/frp/frps.toml` 的 `vhostHTTPPort 80→8000`，让 Caddy 接管 80/443
- 配置文件: `/etc/frp/frps.toml`，改完 `sudo systemctl restart frps`
- tunnel-cli 调试穿透会临时受影响（切到 8000 端口），后续 Caddy 通配兜底恢复标准端口

---

## 2. ai-todo vs little-bee 迁移差异

| 维度       | little-bee                 | ai-todo                                | 迁移复杂度       |
| ---------- | -------------------------- | -------------------------------------- | ---------------- |
| DB 访问    | Prisma + adapter-pg        | **@vercel/postgres 直接 SQL**          | 中（要写兼容层） |
| 媒体       | 3691 文件 Blob → COS       | **无 Blob**                            | 低（跳过）       |
| 鉴权       | session cookie             | JWT + **Space API Token（ait\_）已有** | 低（现成）       |
| 数据库迁移 | Prisma findMany+createMany | **pg 双连接脚本**                      | 中               |

**ai-todo 核心工作量 = DB 访问层重写 + PG 数据迁移脚本**。

---

## 3. 迁移步骤（详细，照做）

### 步骤 1: DB 访问层重写（@vercel/postgres → pg）

ai-todo 用 `import { sql } from "@vercel/postgres"` 的 tagged template。装 `pg`，写兼容包装，业务代码几乎不改。

**1.1 装 pg**:

```bash
npm install pg @types/pg
```

（`@vercel/postgres` 先留着，兼容层验证 OK 后再 `npm uninstall @vercel/postgres`）

**1.2 改 `lib/db.ts`**（或新建 `lib/pg.ts`）—— 提供 `sql` 兼容包装:

```typescript
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.POSTGRES_URL,
  max: 5,
});

// 兼容 @vercel/postgres 的 sql tagged template
// 用法不变：await sql`SELECT * FROM ai_todo_tasks WHERE user_id=${userId}`
export const sql = async (strings: TemplateStringsArray, ...values: any[]) => {
  let text = "";
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < values.length) text += `$${i + 1}`;
  }
  const result = await pool.query(text, values);
  return { rows: result.rows, rowCount: result.rowCount, command: result.command };
};

export { pool as db }; // 如代码直接用 pool
```

**1.3 全局替换 import**:

```bash
# macOS
grep -rl '@vercel/postgres' app lib components | xargs sed -i '' 's|from "@vercel/postgres"|from "@/lib/db"|g'
# 如果 1.2 写在 lib/pg.ts，改成 from "@/lib/pg"
```

**1.4 ⚠️ transaction**：`@vercel/postgres` 有 `sql.begin(async tx => ...)`，pg 要单独实现。grep 检查：

```bash
grep -rn "sql\.begin\|sql\.transaction" app lib
```

若有，用 `pool.connect()` + `client.query('BEGIN'/'COMMIT'/'ROLLBACK')` 改写。

**1.5 验证**：`npm run dev`（连 Vercel Postgres），打开笔记页，确认功能正常。

### 步骤 2: PG 数据迁移（Vercel Postgres → VPS PG）

**2.1 VPS PG 建 ai_todo DB**:

```bash
ssh -i ~/.ssh/little-bee-vps ubuntu@43.143.124.222 \
  "sudo docker exec little-bee-pg psql -U littlebee -c 'CREATE DATABASE ai_todo;'"
```

**2.2 SSH 隧道（本地 15432 → VPS PG）**:

```bash
ssh -i ~/.ssh/little-bee-vps -fN -o ExitOnForwardFailure=yes -L 15432:127.0.0.1:5432 ubuntu@43.143.124.222
nc -z 127.0.0.1 15432 && echo "隧道 OK"
```

**2.3 在 VPS ai_todo 建 schema**（用 ai-todo 自带的 db-migrate，已用新 pg 包装）:

```bash
# 源 .env.local 的 POSTGRES_URL 是 Vercel Postgres，临时覆盖成 VPS ai_todo via 隧道
VPS_PWD=$(grep "^VPS_PG_SUPERUSER_PASSWORD=" .env.local | sed 's|.*=||' | tr -d "'\"")
POSTGRES_URL="postgresql://littlebee:${VPS_PWD}@localhost:15432/ai_todo" \
  node scripts/db-migrate.mjs
```

**2.4 数据迁移脚本**（新建 `scripts/migrate-data-to-vps.mjs`）:

```javascript
import pg from "pg";
import "dotenv/config";

const src = new pg.Pool({ connectionString: process.env.POSTGRES_URL }); // Vercel Postgres（源）
const dst = new pg.Pool({ connectionString: process.env.VPS_POSTGRES_URL }); // VPS ai_todo（via 隧道）

const tables = [
  "ai_todo_tasks",
  "ai_todo_task_members",
  "ai_todo_task_logs",
  "ai_todo_notifications",
  "ai_todo_activated_users",
];

(async () => {
  await dst.query("SET session_replication_role = replica"); // 禁 FK 任意顺序插
  for (const t of tables) {
    const { rows } = await src.query(`SELECT * FROM ${t}`);
    if (!rows.length) {
      console.log(`${t}: 空`);
      continue;
    }
    await dst.query(`DELETE FROM ${t}`); // 幂等
    for (const row of rows) {
      const cols = Object.keys(row);
      const vals = cols.map((_, i) => `$${i + 1}`);
      await dst.query(
        `INSERT INTO ${t} (${cols.join(",")}) VALUES (${vals.join(",")})`,
        cols.map((c) => row[c])
      );
    }
    console.log(`${t}: ${rows.length} 行 ✅`);
  }
  await dst.query("SET session_replication_role = origin");
  console.log("完成");
  process.exit(0);
})();
```

跑：

```bash
VPS_PWD=$(grep "^VPS_PG_SUPERUSER_PASSWORD=" .env.local | sed 's|.*=||' | tr -d "'\"")
VPS_POSTGRES_URL="postgresql://littlebee:${VPS_PWD}@localhost:15432/ai_todo" \
  node scripts/migrate-data-to-vps.mjs
```

**2.5 验证**:

```bash
ssh -i ~/.ssh/little-bee-vps ubuntu@43.143.124.222 \
  "sudo docker exec little-bee-pg psql -U littlebee -d ai_todo -c 'SELECT count(*) FROM ai_todo_tasks;'"
```

### 步骤 3: next.config standalone + Dockerfile

**3.1 `next.config.ts` 加 `output: 'standalone'`**（和 little-bee 一样）

**3.2 `deploy/Dockerfile`**（ai-todo 无 Prisma，比 little-bee 简单）:

```dockerfile
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat wget
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3002 HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3002
CMD ["node", "server.js"]
```

**3.3 `deploy/.dockerignore`**: 参考 `../little-bee/deploy/.dockerignore`（排除 node_modules/.next/.git/.env\* 等）

### 步骤 4: 部署到 VPS

**4.1 生成 `.env.production`**（从 .env.local 派生，POSTGRES_URL 改 VPS）:

```bash
# 容器内连 PG（跨容器，同 little-bee-net 网络）：用容器名 little-bee-pg
VPS_PWD=$(grep "^VPS_PG_SUPERUSER_PASSWORD=" .env.local | sed 's|.*=||' | tr -d "'\"")
sed -e "s|^POSTGRES_URL=.*|POSTGRES_URL=postgresql://littlebee:${VPS_PWD}@little-bee-pg:5432/ai_todo|" \
    -e "s|^AUTH_DEV_BYPASS=.*|AUTH_DEV_BYPASS=false|" \
    .env.local > .env.production
```

**4.2 `deploy/docker-compose.yml`**（独立 compose，复用 little-bee 的网络）:

```yaml
services:
  ai-todo:
    build:
      context: ..
      dockerfile: deploy/Dockerfile
    image: ai-todo:latest
    container_name: ai-todo
    restart: unless-stopped
    env_file: [../.env.production]
    environment:
      - NODE_ENV=production
      - PORT=3002
      - HOSTNAME=0.0.0.0
    expose: ["3002"]
    networks: [little-bee-net]

networks:
  little-bee-net:
    external: true # little-bee 已创建，复用
```

**4.3 rsync 代码 + build + up**:

```bash
# rsync 到 VPS（排除 node_modules/.next/.git/.env*，参考 little-bee 流程）
rsync -az --delete \
  --exclude='node_modules' --exclude='.next' --exclude='.git' \
  --exclude='.env*' --exclude='playwright-report' --exclude='test-results' \
  -e "ssh -i ~/.ssh/little-bee-vps" \
  /Users/stringzhao/workspace/ai-todo/ ubuntu@43.143.124.222:/home/ubuntu/ai-todo/

scp -i ~/.ssh/little-bee-vps .env.production ubuntu@43.143.124.222:/home/ubuntu/ai-todo/.env.production

# VPS build + 起
ssh -i ~/.ssh/little-bee-vps ubuntu@43.143.124.222 \
  "cd /home/ubuntu/ai-todo/deploy && docker compose up -d --build"
```

**4.4 验证**（容器内）:

```bash
ssh -i ~/.ssh/little-bee-vps ubuntu@43.143.124.222 \
  "sudo docker exec ai-todo wget -qO- http://localhost:3002/api/tasks?type=1 | head -c 300"
```

### 步骤 5: 笔记 API 暴露（域名 + HTTPS，等备案）

**备案通过后做**（备案前用 IP + 3002 开发测试）:

1. **DNSPod 加 A 记录**: `ai-todo.stringzhao.life` → `43.143.124.222`（用 AK/SK 脚本或控制台）
2. **改 frps**: `/etc/frp/frps.toml` 的 `vhostHTTPPort 80→8000`，`systemctl restart frps`
3. **Caddy 加反代**（在 little-bee 的 Caddyfile 加，或起独立 Caddy）:

```caddyfile
ai-todo.stringzhao.life {
    encode zstd gzip
    reverse_proxy ai-todo:3002
}
```

4. `docker compose restart caddy`（little-bee 的 caddy，或 ai-todo 自己的）触发 Let's Encrypt 签证

### 步骤 6: Mac app 接入（笔记 API 门面 + session_token）

**笔记 API 已重构为独立门面 `/api/notes/*`**（Phase 1 个人笔记），鉴权用 **session_token**（复用 CLI `/api/auth/cli-token`，HMAC-SHA256，90 天），**非 `ait_*`**。

> 完整接口文档（Mac app 接入依据）：[`documents/api/notes-api.md`](documents/api/notes-api.md) + [`documents/api/openapi.yaml`](documents/api/openapi.yaml)

**Mac app 调用示例**:

```http
POST http://43.143.124.222:3002/api/notes
Authorization: Bearer <session_token>
Content-Type: application/json
{ "title": "笔记内容", "tags": ["#标签"] }
```

**笔记 API 端点**（详情见文档）:
| 路径 | 方法 | 功能 |
|---|---|---|
| `/api/notes` | GET | 列表（游标分页）|
| `/api/notes` | POST | 创建（**Mac app 主入口**）|
| `/api/notes/{id}` | GET/PATCH/DELETE | 单条 / 更新 / 删除 |
| `/api/notes/{id}/share` | POST/DELETE | 生成 / 取消分享 |
| `/api/notes/shared/{code}` | GET | 公开访问（无需鉴权）|

**鉴权流程**：浏览器登录 ai-todo → `/api/auth/cli-token` 换 `session_token`（90 天）→ Mac app Bearer 调用。

> 注：`ait_*` Space API Token 绑死单空间，**不适用**个人笔记（Phase 2 笔记「移入空间」多人共享时再启用 `ait_*`）。

---

## 4. 凭据清单（已在 ai-todo/.env.local）

| key                                 | 值/用途                               |
| ----------------------------------- | ------------------------------------- |
| `TENCENTCLOUD_SECRET_ID/SECRET_KEY` | 腾讯云 API（COS/CDN/DNSPod）          |
| `TENCENTCLOUD_APPID`                | `1324334992`                          |
| `TENCENTCLOUD_REGION`               | `ap-shanghai`                         |
| `VPS_HOST`                          | `43.143.124.222`                      |
| `VPS_SSH_USER` / `VPS_SSH_KEY`      | `ubuntu` / `~/.ssh/little-bee-vps`    |
| `VPS_PG_SUPERUSER_PASSWORD`         | little-bee-pg 的 `littlebee` 用户密码 |
| `VPS_PG_AI_TODO_DB`                 | `ai_todo`                             |

⚠️ 提交前 `git check-ignore .env.local` 确认忽略（已验证 OK）。

---

## 5. 验证清单

- [ ] `lib/db.ts` pg 兼容层；所有 `@vercel/postgres` import 替换
- [ ] `npm run dev` 本地跑通（连 Vercel Postgres，验证兼容层）
- [ ] VPS PG `ai_todo` DB 建好 + schema + 数据迁移完成（行数对得上源）
- [ ] Dockerfile build 成功，容器跑通，连 VPS PG 读数据
- [ ] 容器内 `/api/tasks?type=1` 返回数据
- [ ] 备案通过 → DNS 切 + Caddy HTTPS
- [ ] Mac app 用 session_token 调 `/api/notes` 成功（创建/列表/更新/删除，参 `documents/api/notes-api.md`）

---

## 6. 可复用资源（从 little-bee）

| 文件                                                      | 参考价值                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| `../little-bee/deploy/Dockerfile`                         | Dockerfile（little-bee 含 Prisma，ai-todo 简化版见上文步骤 3.2） |
| `../little-bee/deploy/Caddyfile`                          | Caddy 配置                                                       |
| `../little-bee/deploy/docker-compose.yml`                 | compose 结构                                                     |
| `../little-bee/scripts/migration/verify-tencent-perms.ts` | 腾讯云三权限验证                                                 |
| `../little-bee/scripts/migration/pg-to-vps.ts`            | PG 迁移（little-bee 用 Prisma，ai-todo 用 pg，见上文步骤 2.4）   |
| `../little-bee/CLAUDE.md`                                 | 项目规范参考                                                     |

SSH 密钥 `~/.ssh/little-bee-vps` 在本机，ai-todo 会话直接用（同一台 Mac）。

---

## 7. 风险与注意

1. **内存**：VPS 2G 已跑 little-bee + wewe-rss + frps。ai-todo 加进来约 +300MB，紧但可行（1.9G swap 兜底）。监控 OOM，必要时升 4G。
2. **PG 连接池**：ai-todo + little-bee 共享 PG 实例，独立 DB。`pg.Pool` 各 `max: 5`，别太大。
3. **frps 80 冲突**：上线前必须改 `vhostHTTPPort 80→8000`，否则 Caddy 拿不到 80，HTTPS 签证失败。
4. **备案前不发布**：Mac app 正式发布要 HTTPS + 域名 = 等备案。开发测试用 `http://43.143.124.222:3002`。
5. **pg_dump 版本不兼容**：本地 pg_dump 16 vs Vercel Postgres（Neon）17，pg_dump 会 abort。**用 node pg 脚本迁数据**（步骤 2.4），绕过版本问题。
6. **@vercel/postgres 的 transaction**：如 ai-todo 用了 `sql.begin`，pg 兼容层要单独实现（步骤 1.4）。
7. **vercel.json 的 cron**（`/api/cron/daily-digest`）：VPS 上没 Vercel Cron，要换成系统 crontab 或 skip（如非必需）。
8. **vercel.json 的 regions hnd1**：VPS 部署忽略，删 vercel.json 或仅留配置项。

---

## 8. 推荐执行顺序

1. 步骤 1（DB 兼容层）+ 本地 dev 验证 ← 改动最关键，先确认代码层 OK
2. 步骤 2（PG 迁移）← 数据搬过去
3. 步骤 3（next.config + Dockerfile）+ 步骤 4（部署 + 容器验证）← 跑通
4. **备案通过前**：Mac app 用 `http://43.143.124.222:3002` 开发联调
5. **备案通过后**：步骤 5（DNS + Caddy + HTTPS）+ 步骤 6（Mac app 切正式域名发布）
