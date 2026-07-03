# Knowledge Index

- [proxy/auth sync](patterns.md) — proxy.ts 与路由层认证逻辑必须保持同步（session_token fallback）
- [权限矩阵测试同步](patterns.md) — 改 PERMISSION_MATRIX 必须同步数据驱动测试期望值，字段级测试会跟随扩散
- [权限诊断先验证 \_member_role](patterns.md) — 诊断"管理员无权操作"先查直接成员 vs 组织虚拟成员两条路径，以 DB 真实数据为准
