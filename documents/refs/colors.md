# stringzhao-life 色彩体系

品牌色：苔 Sage — oklch(0.488 0.088 158) / #3A7D68 — CTA、品牌强调

核心色板：
- 墨 Ink: oklch(0.155 0.006 95) / #1A1A18 — 正文、标题
- 纸 Paper: oklch(0.975 0.010 95) / #F7F6F1 — 页面背景
- 雾 Mist: oklch(0.928 0.005 95) / #EBEBEA — 卡片、次级背景
- 烟 Smoke: oklch(0.595 0.005 95) / #8F8F8D — 描述、辅助文字
- 炭 Charcoal: oklch(0.400 0.005 95) / #595957 — placeholder、标签

辅助色板：
- 苔浅 Sage Light: oklch(0.620 0.075 160) / #52A688 — hover、选中态
- 苔淡 Sage Mist: oklch(0.940 0.025 158) / #E8F2EE — tag 背景、浅色填充
- 琥 Amber: oklch(0.668 0.155 68) / #D4920A — warning、highlight
- 朱 Vermillion: oklch(0.548 0.168 23) / #D94F3D — error、delete
- 天 Sky: oklch(0.568 0.118 242) / #3B87CC — link、info badge

使用原则：
- 纸/墨用于大面积背景与文本，苔绿仅作点睛
- 三级灰阶（雾/烟/炭）承接信息层级
- 琥/朱/天对应 warning / destructive / info 语义状态

CSS Tokens（app/globals.css）：
--home-bg: oklch(0.975 0.010 95)
--home-fg: oklch(0.155 0.006 95)
--home-muted: oklch(0.595 0.005 95)
--home-accent: oklch(0.488 0.088 158)
--home-accent-hover: oklch(0.620 0.075 160)
--home-accent-foreground: oklch(0.975 0.010 95)
--home-accent-mist: oklch(0.940 0.025 158)
--home-border: oklch(0.850 0.012 120 / 0.40)
--home-surface: oklch(0.992 0.006 95 / 0.72)
--home-shadow: oklch(0.300 0.050 158 / 0.28)
--home-focus: oklch(0.488 0.088 158)
