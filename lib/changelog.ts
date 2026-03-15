export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
  notable?: boolean;
}

export const changelog: ChangelogEntry[] = [
  {
    version: "1.21.0",
    date: "2026-03-15",
    title: "轻量笔记",
    items: [
      "新增笔记功能，支持快速记录想法、灵感和备忘",
      "输入「记一下...」「想法：...」「笔记 #标签」即可创建笔记",
      "笔记视图按日期分组的卡片时间流，支持标签筛选",
      "笔记加截止日期或优先级时自动变为任务，无缝互转",
      "CLI 新增 notes:list / notes:create 命令",
    ],
    notable: true,
  },
  {
    version: "1.20.1",
    date: "2026-03-13",
    title: "人员甘特图周视图",
    items: [
      "人员视角改为周时间线网格，横轴 7 天、纵轴按人分组，一眼看清每天谁在做什么",
      "支持上/下周切换，今日列高亮，周末淡色区分",
      "跨天任务在每个覆盖日都显示，同天多任务纵向堆叠",
    ],
    notable: true,
  },
  {
    version: "1.20.0",
    date: "2026-03-12",
    title: "甘特图人员维度优化",
    items: [
      "甘特图新增「任务/人员」子 tab，人员视角每人一行、多任务平铺",
      "任务条上的负责人头像更醒目，左侧前置显示品牌色头像圆",
    ],
    notable: true,
  },
  {
    version: "1.19.1",
    date: "2026-03-12",
    title: "AI 总结数据源代理简化",
    items: [
      "AI 总结数据源改为直接请求配置里的 URL，不再在服务端额外套一层代理",
      "支持把内网接口先经由本地 frp 暴露后，直接作为数据源地址使用",
    ],
  },
  {
    version: "1.19.0",
    date: "2026-03-12",
    title: "PWA 支持 + 推送提醒",
    items: [
      "支持添加到主屏幕，离线时显示友好提示页",
      "智能推送提醒横幅，使用几次后自动提示开启浏览器推送",
    ],
    notable: true,
  },
  {
    version: "1.18.0",
    date: "2026-03-11",
    title: "通知优化：链接修复 + 浏览器推送",
    items: [
      "修复通知点击无反应的问题，通知项改为可导航链接，个人任务通知支持跳转并高亮",
      "新增浏览器推送通知，支持 Safari/Chrome 原生通知弹窗",
      "通知偏好新增「推送」通道，可按类型独立开关",
    ],
    notable: true,
  },
  {
    version: "1.17.0",
    date: "2026-03-11",
    title: "AI 总结自定义配置",
    items: [
      "支持自定义系统 Prompt 和数据模板，通过 AI 配置助手自然语言修改",
      "支持添加外部 HTTP 数据源（GET/POST），总结时自动拉取并注入上下文",
      "独立设置页面（空间设置 → AI 总结设置 / 总结 Tab 齿轮图标）",
      "CLI 新增 summary:config 和 summary:update-config 命令",
    ],
    notable: true,
  },
  {
    version: "1.16.1",
    date: "2026-03-10",
    title: "AI 总结进度修复",
    items: [
      "修复 AI 总结中有子任务的任务进度始终显示 0% 的问题，现在基于子任务完成状态实时计算（如 6/9 67%）",
    ],
  },
  {
    version: "1.16.0",
    date: "2026-03-10",
    title: "账号设置页全新设计",
    items: [
      "Profile Header 卡片：头像 + 昵称 + 邮箱，一目了然",
      "Apple 风格卡片分组布局，视觉层级更清晰",
      "通知设置改用 Toggle Switch 开关，操作更直观",
    ],
    notable: true,
  },
  {
    version: "1.15.1",
    date: "2026-03-10",
    title: "空间成员权限修复",
    items: [
      "修复空间成员无法访问空间根节点的问题（AI 总结、编辑、日报等返回 Not found）",
    ],
  },
  {
    version: "1.15.0",
    date: "2026-03-10",
    title: "侧边栏布局优化",
    items: [
      "通知和更新日志改为图标按钮，侧边栏底部更紧凑",
      "通知改为独立页面，桌面端不再使用弹窗",
      "更新日志红点仅在重要更新时显示",
    ],
  },
  {
    version: "1.14.0",
    date: "2026-03-10",
    title: "通知系统",
    notable: true,
    items: [
      "新增应用内通知中心：侧边栏铃铛图标 + 移动端通知 Tab",
      "任务指派、@提到、完成、删除、进展日报等操作自动触发通知",
      "空间成员变动（加入申请、审批、移除）自动通知",
      "通知偏好设置：每种通知类型可独立控制应用内和邮件开关",
    ],
  },
  {
    version: "1.13.0",
    date: "2026-03-10",
    title: "日期时间选择器升级",
    notable: true,
    items: [
      "全新日期时间选择器：日历面板 + 时间输入 + 快捷按钮（今天/明天/下周一）",
      "支持设置具体小时和分钟，不再只能选日期",
      "所有日期显示统一升级，智能显示「今天 14:30」「明天 09:00」等格式",
    ],
  },
  {
    version: "1.12.2",
    date: "2026-03-10",
    title: "修复空间内创建任务失败",
    items: [
      "修复在空间视图下创建任务时显示「父任务未匹配」导致无法创建的问题",
    ],
  },
  {
    version: "1.12.1",
    date: "2026-03-10",
    title: "修复手机端任务名截断",
    items: [
      "修复移动端任务名右侧明明有空间却被截断的问题",
    ],
  },
  {
    version: "1.12.0",
    date: "2026-03-10",
    title: "空间任务显示创建者",
    items: [
      "空间任务 hover 时显示创建者名称，方便了解任务来源",
    ],
  },
  {
    version: "1.11.0",
    date: "2026-03-10",
    title: "AI 总结全员可用 + 服务端缓存",
    notable: true,
    items: [
      "AI 总结改为服务端缓存，同一空间所有成员共享已生成的总结",
      "所有空间成员均可生成 AI 总结（普通成员每日 10 次，管理员/创建者每日 100 次）",
      "显示今日剩余生成次数",
    ],
  },
  {
    version: "1.10.0",
    date: "2026-03-10",
    title: "空间设置抽屉化",
    items: [
      "空间设置改为右侧抽屉打开，无需跳转页面，操作更流畅",
    ],
  },
  {
    version: "1.9.0",
    date: "2026-03-10",
    title: "空间管理员角色 + AI 总结权限",
    notable: true,
    items: [
      "新增管理员角色，创建者可在设置中提升成员为管理员",
      "管理员可审批新成员、移除普通成员",
      "管理员和创建者可生成 AI 总结，普通成员仅可查看已有总结",
    ],
  },
  {
    version: "1.8.2",
    date: "2026-03-09",
    title: "已完成任务保持层级展示",
    items: [
      "已完成任务区域按父子层级缩进展示，不再扁平罗列",
      "已完成任务详情正确显示成员信息",
    ],
  },
  {
    version: "1.8.1",
    date: "2026-03-09",
    title: "修复空间任务列表遗漏部分任务",
    items: [
      "修复通过 CLI 创建的空间任务在列表中不显示的问题",
      "统一空间任务查询逻辑，确保所有层级的任务都能正确展示",
    ],
  },
  {
    version: "1.8.0",
    date: "2026-03-09",
    title: "侧边栏宽度可拖拽调整",
    notable: true,
    items: [
      "拖拽侧边栏右边缘可自由调整宽度（160px ~ 400px）",
      "宽度偏好自动保存，刷新后保持",
      "双击边缘可恢复默认宽度",
    ],
  },
  {
    version: "1.7.1",
    date: "2026-03-09",
    title: "空间聚焦体验优化",
    items: [
      "聚焦子任务时，子任务的下级任务也能正确显示",
      "面包屑导航支持多层级路径，可逐级点击跳转",
      "侧边栏点击空间名可回到空间根视图",
    ],
  },
  {
    version: "1.7.0",
    date: "2026-03-08",
    title: "语音输入升级",
    notable: true,
    items: [
      "语音识别改用服务端 Whisper 引擎，不再依赖浏览器内置 API",
      "全面兼容 Edge、微信浏览器等此前不支持的环境",
      "录音中显示实时时长，识别中显示加载状态",
    ],
  },
  {
    version: "1.6.0",
    date: "2026-03-08",
    title: "语音输入",
    notable: true,
    items: [
      "新增语音输入，支持中文语音识别（zh-CN）",
      "录音状态实时反馈，识别结果自动填入输入框",
      "支持 iOS Safari 和 Android Chrome，方便手机端操作",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-03-08",
    title: "昵称与账号设置",
    notable: true,
    items: [
      "支持设置全局昵称，所有面板优先展示昵称",
      "新增账号设置页，整合邀请码和切换账号功能",
      "邀请码自动生成，过滤已撤销状态",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-03-05",
    title: "项目空间协作",
    notable: true,
    items: [
      "支持创建项目空间，邀请成员协作",
      "空间内 @mention 指派任务给成员",
      "加入空间支持邀请链接和审批模式",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-03-01",
    title: "AI 自然语言操作",
    notable: true,
    items: [
      "AI 输入框支持更新、完成、删除等自然语言操作",
      "支持批量创建层级任务",
      "新增任务进展日报功能",
    ],
  },
];

export function getLatestVersion(): string {
  return changelog[0]?.version ?? "0.0.0";
}

export function hasNotableUpdate(lastSeenVersion: string | null): boolean {
  if (!lastSeenVersion) return true;
  for (const entry of changelog) {
    if (entry.version === lastSeenVersion) break;
    if (entry.notable) return true;
  }
  return false;
}
