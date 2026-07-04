# Knowledge Index

- [proxy/auth sync](patterns.md) — proxy.ts 与路由层认证逻辑必须保持同步（session_token fallback）
- [权限矩阵测试同步](patterns.md) — 改 PERMISSION_MATRIX 必须同步数据驱动测试期望值，字段级测试会跟随扩散
- [权限诊断先验证 \_member_role](patterns.md) — 诊断"管理员无权操作"先查直接成员 vs 组织虚拟成员两条路径，以 DB 真实数据为准
- [BFF cookie 透传](patterns.md) — 跨 user.stringzhao.life 调用统一走服务端代理（cookie 透传 + serviceKey 注入 + 4xx 透传/5xx 502），serviceKey 强制 svc- 前缀
- [契约偏差读上游源码验证](patterns.md) — 设计文档契约可能与上游实际不符（200/201、错误格式），蓝队读源码验证 + contract-change-request，否则红蓝冲突
