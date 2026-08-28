# 贡献指南

欢迎 issue 和 PR。

## 本地开发

```bash
git clone https://github.com/strzhao/ai-todo.git
cd ai-todo
npm install
cp apps/web/.env.example apps/web/.env.local   # 填 POSTGRES_URL / DEEPSEEK_API_KEY；本地可设 AUTH_DEV_BYPASS=true 跳过登录
npm run dev                                     # http://localhost:4000
```

数据库为 Postgres（`POSTGRES_URL`），表结构由应用启动时自动初始化。

## Commit 规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)（`feat:` / `fix:` / `docs:` / `chore:` …），已配置 commitlint 强制校验。

## PR 流程

1. Fork 或建 feature 分支
2. 改动尽量聚焦单一关注点，附上「怎么验证」的说明
3. CI 绿后请求 review；API 改动请同步更新 [`documents/api/`](documents/api/) 下的文档

## 报告问题

提 issue 时请附：复现步骤、期望行为、实际行为、浏览器环境。
