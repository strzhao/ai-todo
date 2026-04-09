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
