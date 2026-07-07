---
id: T006
name: native-capabilities
depends_on: [T005]
milestone: M3
---

# T006: 原生能力（菜单栏/快捷键/通知/托盘）

## 目标

Rust 侧实现菜单栏常驻 + 全局快捷键唤出 + 系统通知（轮询）+ 系统托盘。完整桌面应用定位下用户已确认默认包含（brainstorm 四轮澄清）。

## 架构上下文

- 原生能力层（`design.md` 决策 5）：菜单栏 + 全局快捷键（Cmd+Shift+Space）+ 系统通知（轮询，非 Web Push）+ 系统托盘
- 通知方案已定（跨任务约束 + C3）：轮询 `/api/notifications/unread-count`，30s 间隔，复用 `lib/use-notifications.ts` 逻辑，不走 Web Push
- C4：全局快捷键触发通过 `emit('global-shortcut', { id })` 通知前端
- T005 产出 `tauri.conf.json` + Tauri builder，本任务追加 plugin 注册

## 实现步骤

1. `apps/mac/src-tauri/Cargo.toml` 加依赖：`tauri-plugin-global-shortcut` + `tauri-plugin-notification` + `tauri-plugin-tray`（或 Tauri 2 内置 tray API）
2. 菜单栏常驻：配置 Tauri 2 的 menu bar app 模式（`app.macOSPrivateFramework` 或 `app.menuBar` 配置，window 隐藏到菜单栏）
3. 全局快捷键：Rust 侧 `tauri-plugin-global-shortcut` 注册 `Cmd+Shift+Space`，触发时 `app.emit('global-shortcut', { id: 'toggle-window' })`，前端监听后 toggle 窗口显示/隐藏
4. 系统通知：
   - 前端侧 `apps/mac/src/notifications/use-mac-notifications.ts`：轮询 `api.pollUnreadCount()`（30s），有新通知时 `tauri-plugin-notification` 发系统通知
   - 或 Rust 侧轮询 + 发通知（二选一，前端轮询更简单，复用 SWR 逻辑）
5. 系统托盘：Tauri 2 tray icon + 菜单（显示主窗口/退出）
6. `apps/mac/src/lib/global-shortcut-listener.ts`：监听 `global-shortcut` event，toggle 窗口
7. `apps/mac/src-tauri/src/main.rs`：Tauri builder 追加 plugin 注册（global-shortcut/notification/tray）+ 事件处理
8. 验证：`npm run tauri dev` 启动后，Cmd+Shift+Space 唤出/隐藏窗口；触发通知时系统通知弹出；托盘图标可点

## 输入/输出契约

- **输入**：T005 的 Tauri 2 工程 + `tauri.conf.json` + builder
- **输出**：菜单栏 + 全局快捷键 + 系统通知轮询 + 系统托盘完整实现
- **下游契约**：T007 在此基础上加签名/公证/updater

## 验收标准

- [ ] Cmd+Shift+Space 全局快捷键唤出/隐藏窗口（无需 app 聚焦）
- [ ] 菜单栏图标存在，点击可显示菜单
- [ ] 系统托盘图标存在，含"显示主窗口/退出"菜单
- [ ] 轮询 `/api/notifications/unread-count` 工作中（DevTools Network 或 Rust 日志验证 30s 间隔）
- [ ] 有未读通知时 macOS 系统通知弹出
- [ ] `apps/mac/src` 通知逻辑无 Web Push 依赖（`grep -rn 'push\|VAPID' apps/mac/src` 无命中，除非注释说明）

## 风险与注意事项

- 全局快捷键可能与系统其他 app 冲突，提供可配置选项（后续迭代）
- 菜单栏常驻 + 普通窗口模式可能二选一（menu bar app 通常无 dock 图标），确认用户期望——默认保留 dock + 菜单栏图标
- 系统通知权限：首次需请求 macOS 通知权限，Tauri notification plugin 自动处理授权弹窗
- 轮询在 app 后台时是否继续：macOS 后台 app 限制，可能需 Rust 侧 timer 而非前端 setInterval（前端轮询在窗口隐藏时可能暂停）
- 通知点击应跳转到对应任务/摘要详情，需 deep link 到 app 内路由
