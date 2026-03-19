export const NOTIFICATION_TYPES = {
  // 第一层：必须立刻知道（默认：应用内 ✅ 邮件 ✅ 推送 ✅）
  task_assigned:         { label: "任务被指派给我",    category: "task"  as const, defaultInapp: true,  defaultEmail: true,  defaultPush: true  },
  task_mentioned:        { label: "@提到我",          category: "task"  as const, defaultInapp: true,  defaultEmail: true,  defaultPush: true  },

  // 第二层：应该知道但不紧急（默认：应用内 ✅ 邮件 ❌ 推送 ❌）
  task_reassigned:       { label: "任务被重新指派",    category: "task"  as const, defaultInapp: true,  defaultEmail: false, defaultPush: false },
  task_completed:        { label: "我的任务被完成",    category: "task"  as const, defaultInapp: true,  defaultEmail: false, defaultPush: false },
  task_deleted:          { label: "我的任务被删除",    category: "task"  as const, defaultInapp: true,  defaultEmail: false, defaultPush: false },
  task_log_added:        { label: "我的任务有新进展",   category: "task"  as const, defaultInapp: true,  defaultEmail: false, defaultPush: false },
  space_join_pending:    { label: "有人申请加入空间",   category: "space" as const, defaultInapp: true,  defaultEmail: false, defaultPush: false },
  space_member_approved: { label: "加入申请已通过",    category: "space" as const, defaultInapp: true,  defaultEmail: false, defaultPush: false },
  space_member_removed:  { label: "被移出空间",       category: "space" as const, defaultInapp: true,  defaultEmail: false, defaultPush: false },

  // 组织通知
  org_join_pending:      { label: "有人加入组织",      category: "org"   as const, defaultInapp: true,  defaultEmail: false, defaultPush: false },
  org_member_approved:   { label: "组织加入已通过",    category: "org"   as const, defaultInapp: true,  defaultEmail: false, defaultPush: false },
  org_member_removed:    { label: "被移出组织",       category: "org"   as const, defaultInapp: true,  defaultEmail: false, defaultPush: false },

  // 每日摘要（独立开关，默认关）
  daily_digest:          { label: "每日摘要邮件",     category: "digest" as const, defaultInapp: false, defaultEmail: false, defaultPush: false },
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;
export type NotificationCategory = "task" | "space" | "org" | "digest";
