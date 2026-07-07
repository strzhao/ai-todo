---
id: T005
name: tauri-skeleton
depends_on: [T003, T004]
milestone: M3
---

# T005: Tauri 2 骨架（webview + keychain 集成）

## 目标

建 `apps/mac/src-tauri/`，Tauri 2 webview 加载 T003 的前端构建产物，集成 keychain 存 session_token（迁移 T004 的 localStorage），`tauri dev` 启动验证。**step 0 工具链自检**（当前环境缺 Rust）。

## 架构上下文

- Tauri 2（Rust 核心 + webview），包小性能好（`design.md` 技术选型）
- webview 加载 T003 的 `apps/mac/dist/` 本地产物（`tauri.conf.json` 的 `frontendDist` 指向本地路径，非 https URL —— AC-PROJ-04）
- keychain 集成：`tauri-plugin-keychain` 或 `tauri-plugin-stronghold`，存 session_token（C4 IPC 契约）
- 跨任务约束 5：当前环境缺 Rust（`which rustup cargo` 均无），step 0 必须安装
- C4：`invoke('plugin:ai-todo-keychain|get', { key: 'session_token' })` / `set` / `delete`

## 实现步骤

1. **step 0 工具链自检**：
   - `which rustup cargo` —— 若无，安装：`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y`，`source $HOME/.cargo/env`
   - `cargo install tauri-cli --version "^2.0"` 或用 `npm i -D @tauri-apps/cli`
   - `xcode-select -p` 确认 Xcode CLT（已有）
2. `cd apps/mac && cargo create --bin src-tauri`（或 `npm run tauri init`）
3. `apps/mac/src-tauri/Cargo.toml`：加 `tauri = "2"` + `tauri-plugin-keychain`（或 stronghold）+ `tauri-plugin-http`（如需 Rust 侧 fetch）
4. `apps/mac/src-tauri/tauri.conf.json`：
   - `productName`: `AI Todo`
   - `version`: `0.1.0`（与 `apps/mac/package.json` 一致，C5）
   - `build.frontendDist`: `../dist`（指向 T003 的 Vite 构建产物，本地相对路径 —— AC-PROJ-04）
   - `build.devUrl`: `http://localhost:5173`（dev 模式指向 Vite dev server）
   - `app.macOSMinimumSystemVersion`: `11.0`（或合理下限）
   - identifier: `life.stringzhao.ai-todo.mac`
5. `apps/mac/src-tauri/src/main.rs`：Tauri builder + 注册 keychain plugin + 自定义 `invoke` 命令（`plugin:ai-todo-keychain|get/set/delete`，C4）
6. keychain 集成：实现 Rust 侧 keychain 存取，暴露 `invoke` 命令
7. 前端侧 `apps/mac/src/auth/bearer-auth-strategy.ts`：`headers()` 改为 `await invoke('plugin:ai-todo-keychain|get', { key: 'session_token' })` 读取 token（迁移 T004 的 localStorage），登录成功后 `invoke('...|set', ...)` 写入
8. OAuth 回跳适配：Tauri webview 的 `return_to` 用 `tauri://localhost` 或自定义 deep link（`tauri.conf.json` 的 `app.macOSPrivateFramework` 或 url scheme）
9. 验证：`npm run tauri dev`（在 apps/mac）启动 Tauri 窗口，显示前端，完成登录（token 存 keychain），调 API 返回数据

## 输入/输出契约

- **输入**：T003 的 `apps/mac/dist/` 产物 + T004 的认证模块（BearerAuthStrategy 的 token 读取源待迁移）
- **输出**：`apps/mac/src-tauri/` 完整 Tauri 2 工程 + keychain 集成 + `tauri.conf.json`（frontendDist 指向本地）
- **下游契约（handoff 必含）**：
  - `tauri.conf.json` 结构（T006 加菜单栏/快捷键/通知/托盘配置）
  - keychain invoke 命令契约（T006 不变）
  - Tauri builder 注册位置（T006 追加 plugin 注册）

## 验收标准

- [ ] `which rustup cargo` 有输出（工具链已装）
- [ ] `npm run tauri dev --workspace apps/mac` 启动 Tauri 窗口，显示前端登录页
- [ ] `tauri.conf.json` 的 `frontendDist` 为本地相对路径（`../dist`），不含 `https://`（AC-PROJ-04）
- [ ] 登录流程在 Tauri webview 内完成，token 存 keychain（非 localStorage）
- [ ] `invoke('plugin:ai-todo-keychain|get', { key: 'session_token' })` 返回 token
- [ ] 调 `/api/tasks` 返回真实数据（Bearer header 从 keychain 读）
- [ ] `apps/mac/src-tauri/Cargo.toml` + `tauri.conf.json` version 一致 `0.1.0`（C5）

## 风险与注意事项

- Rust 工具链安装可能需几分钟，首次 `cargo build` 编译依赖耗时较长（5-15 分钟）
- OAuth 回跳在 Tauri webview 内是难点：`return_to` 需用 Tauri 能拦截的 URL scheme。若 web 的 `app/auth/cli` 页用 http 回跳，mac 需改为 `tauri://` 或自定义 scheme。可能需调整 auth-config 的 `return_to` 逻辑（服务端改动——若需要，走 C3 声明）
- keychain plugin 选择：`tauri-plugin-stronghold` 更安全但复杂，`tauri-plugin-keychain`（若存在）或直接用 Rust `keyring` crate。调研后选一个
- Tauri 2 的 `frontendDist` 在 dev 模式用 `devUrl`，build 模式用 `frontendDist`，两者都要配
- macOS minimum version 设太高会限制用户，设太低可能缺 API，建议 `11.0`
