# Decisions

> 重大架构/技术决策记录（ADR-lite）。每条用 `### [YYYY-MM-DD] 标题` + `<!-- tags: ... -->` + 背景/选择/权衡结构。
> 新条目追加在下方，倒序排列（最新在最上）。

### [2026-07-05] changelog 与 package.json 版本号体系解耦

<!-- tags: changelog, version, package.json, getLatestVersion, monotonic -->

- **背景**：`lib/changelog.ts` 用 1.x 产品版本体系（接入前 latest `1.47.0`），`package.json` 用 0.x 工程版本体系（`0.10.4`），两者独立递增。`getLatestVersion()` 返回 `changelog[0].version`（产品版本），侧边栏"有新版本"红点据此判断（`hasNewUpdate(lastSeen)` 比较 `changelog[0]` 与 localStorage）。
- **选择**：新增 changelog 条目版本必须严格 > 历史最新（`1.47.0` → `1.48.0`），保持单调递增；`package.json` 按工程版本独立升（`0.10.4` → `0.11.0`），两者不强求同步。
- **权衡**：若 changelog 新版本 < 历史（如误写 `0.11.0` < `1.47.0`），`getLatestVersion()` 回退，已升级用户 localStorage 存的旧版本（`1.47.0`）会误触"有新版本"红点（误报）。设计文档写版本号时必须先 `grep 'version:' lib/changelog.ts | head -1` 确认产品版本最新值，不能只看 `package.json`。Evidence: 接入 analytics 时设计文档误写 changelog `0.11.0`，蓝队按字面实现致回退，编排器在 implement 合流纠正为 `1.48.0` + 红队版本测试加单调递增断言。

<!-- 新条目追加在此行上方 -->
