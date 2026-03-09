## 沟通原则

- 通过英文思考，但总是通过中文回复

## 项目概述

ai-todo-cli 是为 AI agent 设计的命令行工具，与 ai-todo (https://ai-todo.stringzhao.life) 交互。

## 技术栈

- TypeScript + tsup (ESM)
- Node.js >= 18
- commander + open

## 核心架构原则（严格遵守）

- **所有业务命令从服务端 `/api/manifest` 动态下发，严禁在 CLI 中硬编码业务命令**
- 内置命令仅限 login/logout/whoami（认证相关）
- 新增业务命令 = 服务端加 API + manifest 注册，CLI 自动发现
- manifest 支持 `format: "text"` 字段，CLI 据此输出纯文本而非 JSON
- 默认输出为 JSON
- 认证通过浏览器 OAuth，token 存储在 `~/.config/ai-todo/credentials.json`
- 退出码: 0=成功, 1=错误, 2=需登录

## 对应服务端

- ai-todo 项目在 ../ai-todo/
- manifest 端点: app/api/manifest/route.ts
- CLI 认证页面: app/auth/cli/page.tsx
- CLI token 端点: app/api/auth/cli-token/route.ts
