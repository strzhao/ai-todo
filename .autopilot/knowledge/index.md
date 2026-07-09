# Knowledge Index

- [proxy/auth sync](patterns.md) — proxy.ts 与路由层认证逻辑必须保持同步（session_token fallback）
- [权限矩阵测试同步](patterns.md) — 改 PERMISSION_MATRIX 必须同步数据驱动测试期望值，字段级测试会跟随扩散
- [权限诊断先验证 \_member_role](patterns.md) — 诊断"管理员无权操作"先查直接成员 vs 组织虚拟成员两条路径，以 DB 真实数据为准
- [BFF cookie 透传](patterns.md) — 跨 user.stringzhao.life 调用统一走服务端代理（cookie 透传 + serviceKey 注入 + 4xx 透传/5xx 502），serviceKey 强制 svc- 前缀
- [契约偏差读上游源码验证](patterns.md) — 设计文档契约可能与上游实际不符（200/201、错误格式），蓝队读源码验证 + contract-change-request，否则红蓝冲突
- [changelog 版本号体系](decisions.md) — changelog 1.x 产品版本 vs package.json 0.x 工程版本解耦，新条目必须单调递增避免误触红点
- [Playwright 服务端上报验证](patterns.md) — 服务端 trackServerEvent 不经浏览器，用临时 route fetch status 验证；route 勿以 \_ 开头
- [红队信息隔离致 mock 脚手架缺陷](patterns.md) — 红队不读实现致 mock/签名/返回结构假设错误测试崩溃（非断言失败）；授权修脚手架保留逻辑断言
- [@vercel/postgres→pg 兼容层 + node alias 陷阱](patterns.md) — Object.assign(taggedSql,{query}) 双形态对齐 mock；被 node 直跑的底层模块用相对路径非 @/ alias；.autopilot 副本需 vitest/eslint exclude
- [腾讯云 Lighthouse vs CVM](patterns.md) — VPS 机型认错(lhins- vs ins-)让 cvm/vpc API 全空转；Lighthouse 用 lighthouse 模块 + 防火墙(FirewallRules)+ QcloudLighthouseFullAccess CAM
