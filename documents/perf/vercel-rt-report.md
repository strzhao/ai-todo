# Vercel 接口性能聚合脚本

## 1. 开启 RT 结构化日志

在 Vercel 环境变量里新增：

```bash
ENABLE_RT_LOGS=true
```

然后重新部署一次（让 API 路由开始输出 `[rt] {...}` 日志）。

## 2. 运行聚合脚本

默认统计生产环境最近 2 小时、最多 2000 条日志（仅 `/api/*`）：

```bash
npm run perf:vercel-report
```

常用参数：

```bash
# 最近 6 小时
npm run perf:vercel-report -- --since 6h

# 指定上限
npm run perf:vercel-report -- --since 6h --limit 5000

# 指定项目（如果当前目录未 link 正确）
npm run perf:vercel-report -- --project ai-todo

# 包含非 API 路径
npm run perf:vercel-report -- --all-paths
```

## 3. 输出说明

- `Req`: 该路径请求日志数量（来自 Vercel 请求日志）
- `RT`: 该路径可用 RT 日志数量（来自应用 `[rt]` 结构化日志）
- `P50/P95 Total(ms)`: 总耗时分位值（从 RT 日志里的 `timings.total` 计算）
- `Error Rate`: 错误率（从请求日志状态码计算）
- `Top Segment / Top Share`: 该路径平均耗时占比最高的分段（如 `db_query`、`llm`、`auth`）

如果显示 `RT日志条数: 0`，通常是：

1. `ENABLE_RT_LOGS` 还没打开，或未重新部署；
2. 采样窗口太短（`--since` 可调大）。
