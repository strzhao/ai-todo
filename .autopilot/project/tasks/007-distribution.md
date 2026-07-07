---
id: T007
name: distribution
depends_on: [T006]
milestone: M4
---

# T007: 分发（签名/公证/自动更新）

## 目标

配置 Developer ID 签名 + 公证 + GitHub Releases + Tauri updater 自动更新，产出可分发的 dmg。若用户缺 Apple 凭据，降级为本地未签名构建 + 流程文档。

## 架构上下文

- 分发（`design.md` 决策 6）：Developer ID 签名 + 公证 + GitHub Releases + Tauri updater，不进 App Store
- 跨任务约束 6：需用户提供 Developer ID Application 证书 + notarization Apple ID + app-specific password + Team ID。缺则降级
- 跨任务约束 7：不触发 Vercel 部署（本任务产物是 mac app，与 Vercel 无关）
- C5：updater manifest `version` 与 `tauri.conf.json` 一致
- AC-PROJ-07：dmg 产物 + `hdiutil verify` rc=0

## 实现步骤

1. **凭据确认**：向用户收集（或确认缺失）：
   - Developer ID Application 证书（钥匙串 `.p12` 或钥匙串引用名）
   - Apple ID（notarization 用）
   - app-specific password（Apple ID > app-specific password）
   - Team ID（Developer ID 证书的 Organization Unit）
2. `apps/mac/src-tauri/tauri.conf.json` 加 `plugins.updater` 配置（pubkey + endpoints）
3. 生成 updater 签名密钥对：`tauri signer generate -w ~/.tauri/ai-todo.key`，公钥写入 `tauri.conf.json`，私钥存 GitHub Secrets
4. `apps/mac/src-tauri/Cargo.toml` 加 `tauri-plugin-updater`
5. `apps/mac/src-tauri/tauri.macos.conf.json`（或主 conf）配置签名：`macos.signingIdentity = "Developer ID Application: <Name> (<TeamID>)"` + `macos.notarization = { appleId, password, teamId }`
6. GitHub Actions workflow `.github/workflows/release-mac.yml`：
   - trigger: tag `mac-v*`
   - 步骤：checkout + setup node + setup rust + npm install + `npm run tauri build` + 上传 dmg + 生成 updater manifest (`latest.json`) + 上传到 Release
   - Secrets：APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID / TAURI_SIGNING_PRIVATE_KEY
7. 验证：本地 `npm run tauri build`（需凭据）产出 `.app` + `.dmg`；`hdiutil verify <dmg>` rc=0
8. 文档：`apps/mac/RELEASE.md` 记录发布流程（打 tag → CI 构建 → Release 上传 → updater manifest 更新）
9. **降级路径**（若缺凭据）：跳过签名/公证，`npm run tauri build` 产出未签名 `.app`（启动需右键打开），`RELEASE.md` 记录"待补签名凭据后的完整流程"

## 输入/输出契约

- **输入**：T006 的完整 Tauri 2 app + Apple 凭据（或确认缺失）
- **输出**：签名/公证配置 + GitHub Actions release workflow + updater manifest 机制 + `RELEASE.md` 文档 + 可分发 dmg（或降级未签名 app）
- **最终交付**：dmg 或 app 产物 + 自动更新链路

## 验收标准

- [ ] `tauri.conf.json` 含 `plugins.updater` 配置（pubkey + endpoint）
- [ ] `.github/workflows/release-mac.yml` 存在且语法正确
- [ ] 本地 `npm run tauri build` 产出 `.dmg`（有凭据）或 `.app`（降级）
- [ ] 有凭据：`hdiutil verify <dmg>` rc=0（AC-PROJ-07）
- [ ] 有凭据：`spctl -a -t install <app>` 显示 "source=Notarized Developer ID"（公证成功）
- [ ] updater manifest（`latest.json`）模板存在，`version` 与 `tauri.conf.json` 一致（C5）
- [ ] `RELEASE.md` 文档完整（发布流程 + 凭据需求 + 降级说明）
- [ ] 不触发 Vercel 部署（workflow 只构建 mac app，不碰 web 部署）

## 风险与注意事项

- Apple 凭据是硬依赖：若用户无法提供，T007 必须走降级路径，并在 handoff/完成报告明确"签名/公证待补"
- notarization 可能失败（API 限流、证书过期、entitlements 问题），workflow 需重试逻辑
- updater 公钥私钥对：私钥泄露可导致伪造更新，必须存 GitHub Secrets，不入 git
- Tauri updater 的 endpoint 指向 GitHub Releases 的 `latest.json` raw URL
- 首次发布需打 tag 触发 CI，CI 构建耗时（Rust 编译 + 签名 + 公证 + 上传）约 10-30 分钟
- macOS minimum version 影响兼容性，确认 `tauri.conf.json` 的下限合理
