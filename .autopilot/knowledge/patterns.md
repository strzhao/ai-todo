# Patterns

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
