export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
}

export const changelog: ChangelogEntry[] = [
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
