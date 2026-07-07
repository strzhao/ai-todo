# Patterns

## monorepo 迁移三陷阱：gitignore 根锚定 / eslint 相对路径 / Next.js env cwd

<!-- tags: monorepo, workspaces, gitignore, eslint, nextjs, env, 迁移 -->

单体 Next.js 工程下移到 `apps/web/` + root npm workspaces 化时，三个配置若不适配会静默破坏：

1. **`.gitignore` 根锚定规则失效**：`/node_modules` `/.next/` `/coverage` 等带前导 `/` 的规则只匹配仓库根，迁移后 `apps/web/node_modules/`、`apps/web/.next/` 不被 ignore，`git add -A` 会误提交数百 MB 产物。**修复**：去前导 `/` 改非锚定（`node_modules/` `.next/` 等），匹配任意层级。
2. **eslint flat config 相对路径错位**：`eslint.config.mjs` 留 root 时，`ignores: [".next/"]` `files: ["types/**/*.d.ts"]` 相对 root 解析，迁移后 `apps/web/.next/` 压缩产物不再被 ignore，lint 产生真实 error（非仅 rc 判断失误）。**修复**：ignores/files 加 `apps/web/` 前缀 + `**/` 通配覆盖未来 packages/。
3. **Next.js 16 env 基于 cwd**：`next dev`/`next build` 在 apps/web 运行时 cwd=apps/web，**不读** root `.env.local`。**修复**：`.env.local` cp 到 apps/web/（未入 git 用 cp，已跟踪的 .env.example 用 git mv）。

**教训**：monorepo 迁移的"纯 git mv"不真纯——根锚定配置（gitignore/eslint/ci tsc/vercel build）必须同步适配。plan 审查实测发现 B1/B2 critical（git check-ignore + eslint API 实跑复现），非阅读推断。CI 的 `npx tsc --noEmit` 也需加 `--project apps/web/tsconfig.json`（root 无 tsconfig）。commit 时注意 commitlint body-max-line-length 失败会触发 husky lint-staged 对暂存文件跑 prettier，可能把 R100 纯重命名变成 D+A（内容变化超相似度阈值），需用 `git show HEAD~1:<path>` 恢复。

**关联**：T001 monorepo 迁移，commit da4f02c。

## proxy.ts 与路由层认证必须保持同步

<!-- tags: proxy, auth, session_token, bearer, cli -->

proxy.ts（中间件层）和 getUserFromRequest（路由层）各自独立做 Bearer token 验证。
新增认证方式时必须同时更新两层，否则请求会被 proxy 拦截，永远到不了路由层。

**教训**：CLI 的 session_token（HMAC 签名）在 getUserFromRequest 有 fallback，但 proxy.ts 的 getUserFromCookie 只做 JWT → CLI 登录后所有 API 调用 401。

**检查清单**：

- proxy.ts Path 1（Bearer）使用 `getUserFromCookie` + `verifyGatewaySessionCookieValue`
- lib/auth.ts `getUserFromRequest` 使用 `verifyToken` + `verifyGatewaySessionCookieValue`
- 两者的验证路径必须对等

## 权限矩阵变更必须同步数据驱动测试期望值

<!-- tags: permissions, task-permissions, testing, admin, space -->

`lib/task-permissions.ts` 的 `PERMISSION_MATRIX` 是数据驱动的权限源，`__tests__/task-permissions.acceptance.test.ts` 用一份硬编码的 `matrix: Record<TaskOperation, Record<TaskRole, boolean>>` 对齐断言。改矩阵后必须同步更新该测试的期望值，否则 `npm test` 直接红。

**教训**：方案 B 给 11 个操作追加 `space_admin` 时，除主测试文件外，`milestone.acceptance.test.ts` 也硬编码了"admin 不能改 milestone"（milestone 映射到 update_title）——权限矩阵变更的影响会通过 `FIELD_OPERATION_MAP` 扩散到所有字段级测试。plan-reviewer 提前标注了这一点，避免了回归。

**检查清单**：

- 改 `PERMISSION_MATRIX` 后，grep `__tests__` 中所有 `space_admin` + `toBe(false)` / `不能` 断言，确认是否需同步
- `getDisallowedFields` 的字段级测试（milestone/title 等映射同一 operation 的字段）会跟随 operation 权限变化
- 空间层守卫（`requireSpaceOwner`）与任务矩阵解耦，改任务矩阵不会影响空间转让/解散权限，但应加守卫测试确认隔离

## 诊断权限问题先验证 `_member_role` 真实计算路径

<!-- tags: permissions, db, debugging, org, space -->

用户报"是管理员却无权操作"时，不要只读权限矩阵就下结论。`_member_role` 的计算（`lib/db.ts` 的 `getTaskForUser` SQL）有两条路径：直接成员记录（`ai_todo_task_members.role`）和组织虚拟成员（硬编码 `member`）。`COALESCE(m.role, CASE WHEN om.user_id IS NOT NULL THEN 'member' END)` 取直接成员优先。

**教训**：用户说"hzlixueyong 是组织管理员却无法关闭任务"，初看像是 org admin 被降级为 member 导致。但数据库真实数据显示他在**空间**有直接成员记录 role=admin（组织里反而是 member），`_member_role='admin'` 命中的是直接成员路径。真正根因是权限矩阵 `complete` 不含 `space_admin`，与 org 降级无关。

**检查清单**：

- 用真实 DB 查询 `ai_todo_task_members`（直接成员）和 `ai_todo_org_members`（组织成员）两张表的 role
- 复现 `getTaskForUser` 的 `_member_role` SQL，确认 COALESCE 命中哪条路径
- 用户口中的"管理员"可能是空间 admin、组织 admin 或 owner，三者权限不同，以数据为准

## 跨服务调用统一走 BFF cookie 透传

<!-- tags: bff, cookie, cross-service, service-key, feedback, invitation -->

ai-todo 调用 user.stringzhao.life（base-account）的 API（反馈、邀请码等）时，前端不直连，统一走服务端 BFF 代理：本域登录校验 + serviceKey 注入 + 浏览器 cookie 透传 + 4xx 透传/5xx 502 兜底。这隐藏了 serviceKey、绕开 CORS、固定区域、统一错误格式。

**教训**：cookie 透传依赖上游 cookie 的 domain 配置（跨子域生效）；serviceKey 由环境变量注入，默认值需与上游注册一致（不是任意命名）。

**检查清单**：

- 新增跨 user.stringzhao.life 调用 → 复用 `app/api/invitation/codes/route.ts` / `app/api/feedback/route.ts` + `lib/feedback.ts` 模式
- 透传 cookie：`fetch(AUTH_ISSUER/api/..., { headers: { cookie: req.headers.get("cookie") ?? "" } })`
- serviceKey 注入：`process.env.<X>_SERVICE_KEY ?? "svc-ai-todo"`（base-account `ensureUniqueServiceKey` 强制 `svc-` 前缀，serviceKey = `svc-{hostname 第一段}`，如 ai-todo.stringzhao.life → svc-ai-todo）（核对锚点：2026-07-04 base-account `apps/auth-service/src/server/auth/service-registry.ts`）
- 错误处理：上游 4xx 透传状态码 + 错误体映射（上游 `{error:<code>,message:<text>}` → BFF `{error:<message/fallback>,code:<code>}`）；5xx/超时统一 502 兜底，不泄露上游内部细节

## 契约文档与实际偏差时蓝队读上游源码验证

<!-- tags: contract, verification, upstream, base-account, red-team -->

接入外部服务时，设计文档记录的契约（HTTP 状态码、错误响应格式）可能与上游实际行为不符。蓝队实现时若能访问上游源码，应先读源码验证契约，发现偏差走 contract-change-request 更新设计文档，而不是悄悄按设计文档实现——红队基于设计文档写测试，契约偏差会导致红蓝测试不一致。

**教训**：autopilot 红蓝对抗中，契约是设计文档与实际行为的共识；设计文档错误时，红队测试会忠实地编码错误，蓝队读源码修正实现 → 红蓝冲突 → auto-fix。正确处理是更正设计文档契约 + 同步红队测试的契约性断言（状态码期望值、字段名），而非放宽逻辑断言。

**检查清单**：

- 蓝队读上游源码发现契约偏差 → 触发 contract-change-request（contract-protocol.md §6），回 design 更新契约规约，而非悄悄改实现
- 设计文档的「成功状态码」与「错误响应字段名」是高发偏差点（如 200 vs 201、`{error,message}` vs `{error,code}`）
- 纯函数返回形状（字段名）若设计文档未规定，红蓝各自假设会冲突 → 设计文档应补充明确，或蓝队调整对齐红队（铁律：不改红队契约断言）
- Evidence: 反馈接入设计写"成功 200 + `{error:text,code:code}`"，实际 base-account 返回 201 + `{error:code,message:text}`；蓝队读 `apps/auth-service/src/app/api/feedback/route.ts` 修正，红队基于旧契约失败，auto-fix 改蓝队对齐（核对锚点：2026-07-04 base-account 源码）

## Playwright 验证服务端外部 HTTP 上报

<!-- tags: playwright, e2e, analytics, trackServerEvent, umami, server-side -->

服务端代码（如 `trackServerEvent` 委托 `@umami/node`）从 Node 进程直接 POST 外部端点（Umami `/api/send`），不经过浏览器。Playwright `page.on("response")` 只截获浏览器发的请求，监听不到服务端上报，e2e 会误判"未上报"。

**教训**：接入 analytics 时 e2e 监听 umami `/api/send`，PV（浏览器发）能捕获，但 `login_success`（服务端发）超时失败。根因不是实现 bug，是测试观测点错位。

**检查清单**：

- 服务端上报用**临时 route 端 fetch 同一外部端点取 status** 返回（SDK 容错吞响应，故单独 fetch），Playwright 访问 route 断言返回 status（200 = 接受）；浏览器上报（PV / script.js 加载）仍用 `page.on("response")` 监听
- 临时 route 命名**不能以 `_` 开头**（Next.js App Router 把 `_foo` 目录当私有目录，不注册路由，curl 返回 404）；用 `analytics-verify-test` 等普通名，验证完即删
- 真实数据落库的最强证据是**外部端点返回 200**（Umami 校验 `website_id` 存在才接受），无需登录后台截图；本地用 mock Umami 闭环验证接入代码 + 配真实 website_id 跑 Playwright 验证落库

## 红队信息隔离致 mock 脚手架缺陷（非断言失败）

<!-- tags: red-team, mock, information-isolation, autopilot, acceptance-test, false-green -->

autopilot 红蓝对抗中，红队**信息隔离**（不读蓝队实现）的代价：红队对实现的内部依赖、返回值结构、函数签名做"合理假设"，常与实际不符 → mock 脚手架不完整 → 测试崩溃（TypeError / `No X export is defined on mock` / undefined 读取），**非断言失败**。

**教训**：笔记 API 门面轮，红队假设 createNote 直 SQL INSERT（实际委托 createTask）、getNote 两参含 user_id 过滤（实际单参，归属在路由层 `found.user_id !== userId`）、门面返回 Task（实际 `{note, user_id}`）→ 15 测试崩溃。根因非实现 bug（contract-checker + build + 1011 单测全绿），是信息隔离的固有副作用。

**处理**：编排者识别后**征得用户授权**修红队测试的 mock 脚手架（补全 mock 返回值结构、对齐签名），**严格保留逻辑断言**（type 隔离 / 字段收窄 / 404 不泄漏 / HTTP 码 / 边界逐字不变）。区分两类：① 脚手架缺陷（mock / 签名 / TS 类型）→ 可修；② 逻辑断言（expect）→ 绝不放宽。符合 autopilot knowledge「契约偏差同步红队契约性断言」精神。

**检查清单**：

- 红队测试崩溃（TypeError / `No X export is defined on mock` / undefined 读取）而非 `expect` 失败 → 先查 contract-checker + build 是否绿，判断是信息隔离致 mock 缺陷还是实现偏离
- 修红队脚手架前**征得用户授权**（违反字面铁律"不改红队"），明确边界"保留逻辑断言，只修 mock / 签名 / 类型"
- 设计文档尽量精确到内部依赖（createNote 委托 createTask）+ 返回值结构（`{note, user_id}`）+ 签名（单参 / 多参），压缩红队假设空间
- Evidence: 笔记 API 门面轮 15 红队测试崩溃，3 文件经授权修脚手架后 56/56 全绿，逻辑断言（type 隔离 / DTO 收窄 / 归属 404 / HTTP 契约 / 边界）逐字保留

## @vercel/postgres → pg 兼容层形状 + node 直跑模块的 alias 陷阱

<!-- tags: pg, migration, vercel-postgres, db-migrate, alias, object-assign, vitest-exclude -->

VPS 迁移把 `@vercel/postgres` 换 `pg`，兼容层必须保持 ``sql` ` `` tagged template + `sql.query()` 双形态（业务 ~70% 用 ``sql` ```，~30% 用 `sql.query`含 TEXT[] 数组字段）。形状`export const sql = Object.assign(taggedSql, { query })`对齐现有测试 mock`Object.assign(vi.fn(), { query: vi.fn() })`，业务代码零改动。

**教训**：`lib/db.ts` 被 `scripts/db-migrate.mjs`（node `--experimental-strip-types` 直跑）import 时，`@/lib/pg` 的 tsconfig alias **不解析** → 脚本失效。解法：`lib/db.ts` 用相对路径 `./pg`（同目录），其余 app/api 文件仍用 `@/lib/pg`（Next/webpack 解析）。另外改 route import 后易漏改既有测试的 `vi.doMock("@vercel/postgres")`（daily-digest-cron 漏改 → 真连 PG 报 `database does not exist`）；`.autopilot/runtime/.../acceptance-staging/` 副本会被 vitest/eslint 扫到污染全量结果。

**检查清单**：

- pg 兼容层用 `Object.assign(taggedSql, { query })`（匹配测试 mock 形状 `Object.assign(vi.fn(),{query})`）
- 被 node 直跑脚本（.mjs）import 的底层模块（lib/db.ts）用相对路径，非 `@/` alias
- 迁移后 `grep -rn "from ['\"]@vercel/postgres['\"]" app lib components` 确认无业务残留（含动态 `await import()`）
- 改 route import 后，grep 既有测试的 `vi.mock/doMock("@vercel/postgres")` 同步改 `@/lib/pg`（易漏 doMock 形式）
- `.autopilot/` runtime 副本污染 vitest/eslint → `vitest.config.ts` exclude + `eslint.config.mjs` ignores 都加 `.autopilot/`
- Evidence: VPS 迁移 47 文件，pg 兼容层 + 10 import 替换（静态 9 + 动态 2），daily-digest-cron doMock 漏改致真连 PG，修后 test 1011 全绿

## 腾讯云 Lighthouse（轻量）vs CVM — 机型认错会让 API 全空转

<!-- tags: tencent, lighthouse, cvm, vpc, firewall, security-group, tccli, cam, vps, ports -->

腾讯云「VPS」可能是 **Lighthouse（轻量应用服务器）** 或 **CVM（云服务器）**，两者 API / 防火墙 / CAM 完全独立。认错机型会让 `cvm/vpc` API 全返回 0 实例 / UnauthorizedOperation，空转半天。

**判别**：实例 ID 前缀 `lhins-` = Lighthouse；`ins-` = CVM。Lighthouse 有独立控制台「防火墙」，CVM 用「安全组」。

**教训**：ai-todo VPS（`43.143.124.222`）是 Lighthouse（`lhins-1g04zh0s`）。排查 3002 端口不通时，先 `tccli cvm DescribeInstances` 全 region 0 实例 → 误以为没权限 / region 错，实际是机型错（Lighthouse 不在 cvm）。换 `tccli lighthouse DescribeInstances` 立刻看到实例。

**Lighthouse 操作（tccli）**：

- 查实例：`tccli lighthouse DescribeInstances --region ap-shanghai`
- 查防火墙：`tccli lighthouse DescribeFirewallRules --region ap-shanghai --InstanceId lhins-xxx`
- 加规则：`CreateFirewallRules`（`--FirewallRules.0.{Protocol,Port,CidrBlock,Action}`）
- 改规则：`ModifyFirewallRules`
- CAM 策略：`QcloudLighthouseFullAccess`（**不是** CVM/VPC 的策略）

**检查清单**：

- VPS 排查先确认机型：实例 ID `lhins-` = Lighthouse，`ins-` = CVM
- Lighthouse 防火墙是云层独立于 VPS 内 iptables（改 VPS 内 iptables 不影响 Lighthouse 防火墙）
- tccli 操作 Lighthouse 用 `lighthouse` 模块，CAM 授 `QcloudLighthouseFullAccess`
- docker 容器外部可达要双重：host 端口映射（`ports: "3002:3002"`，**非** `expose`）+ Lighthouse 防火墙放行该端口
- Evidence: ai-todo 3002 不通，cvm 全 0 实例 → 认错机型；改 lighthouse + docker ports 映射 + 防火墙 TCP:3002 → 通
