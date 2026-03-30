export interface Task {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  due_date?: string; // ISO 8601
  start_date?: string; // ISO 8601 计划开始时间
  end_date?: string;   // ISO 8601 计划结束时间
  priority: 0 | 1 | 2 | 3; // 0=P0紧急 1=P1高 2=P2普通 3=P3低
  status: 0 | 2; // 0=待办 2=已完成
  tags: string[];
  sort_order: number;
  created_at: string;
  completed_at?: string;
  // Phase B: @mention & assignee
  space_id?: string;
  assignee_id?: string;
  assignee_email?: string;
  mentioned_emails?: string[];
  // Phase D: hierarchy (arbitrary depth)
  parent_id?: string;
  // Progress percentage (0-100)
  progress: number;
  // 0=task(default), 1=note
  type?: 0 | 1;
  // Pinned task = acts as a "space" (sidebar entry + members + invite)
  pinned?: boolean;
  invite_code?: string;
  invite_mode?: "open" | "approval";
  share_code?: string;
  voice_raw_text?: string;
  milestone?: string;
  creator_email?: string;
  creator_nickname?: string;
  org_id?: string;
  member_count?: number;
  task_count?: number;
  my_role?: "owner" | "admin" | "member";
  _memberRole?: string; // 运行时权限检查用（getTaskForUser JOIN 结果）
}

export interface ParsedTask {
  title: string;
  description?: string;
  due_date?: string;
  start_date?: string;
  end_date?: string;
  priority?: 0 | 1 | 2 | 3;
  tags?: string[];
  // Phase B: @mention
  assignee?: string;
  mentions?: string[];
  // Existing parent target for create action
  parent_target_id?: string;
  parent_target_title?: string;
  progress?: number;
  // 0=task(default), 1=note
  type?: 0 | 1;
  milestone?: string;
  // Phase D: hierarchy — subtasks (max 1 level deep in AI output)
  children?: Omit<ParsedTask, "children">[];
}

// Task member (was SpaceMember; space_id → task_id)
export interface TaskMember {
  id: string;
  task_id: string;
  user_id: string;
  email: string;
  display_name?: string;
  nickname?: string; // 全局昵称（来自 ai_todo_activated_users）
  role: "owner" | "admin" | "member";
  status: "active" | "pending";
  joined_at: string;
}

// Backward-compat aliases (deprecated, use Task / TaskMember directly)
export type Space = Task;
export type SpaceMember = TaskMember & { space_id: string };

// Phase E: Task logs (progress updates)
export interface TaskLog {
  id: string;
  task_id: string;
  user_id: string;
  user_email: string;
  content: string;
  created_at: string;
}

// Phase F: AI-First — all operations via NLInput
export interface ParsedActionChanges {
  title?: string;
  description?: string;
  priority?: 0 | 1 | 2 | 3;
  due_date?: string;
  start_date?: string;
  end_date?: string;
  tags?: string[];
  assignee_email?: string | null;
  progress?: number;
  type?: 0 | 1;
  milestone?: string | null;
}

export interface ParsedAction {
  type: "create" | "update" | "complete" | "delete" | "add_log" | "move" | "reopen";
  // For create
  tasks?: ParsedTask[];
  // For update/complete/delete/add_log/move
  target_id?: string;    // AI 从 tasks 上下文匹配到的 UUID（优先）
  target_title?: string; // 显示/客户端 fuzzy match 兜底
  // For update
  changes?: ParsedActionChanges;
  // For add_log
  log_content?: string;
  // For move
  to_parent_id?: string;
  to_parent_title?: string;
}

export interface ActionResult {
  created?: Task[];
  updated?: Task[];
  completed?: string[];  // task IDs
  deleted?: string[];    // task IDs
  logged?: Array<{ taskId: string }>;
  reopened?: string[];   // task IDs
  errors?: Array<{ action: string; taskTitle: string; error: string }>;
}

// ─── Notifications ──────────────────────────────────────────────────────────────

export interface DailyDigestMetric {
  key: "overdue" | "due_today" | "completed" | "logs";
  label: string;
  count: number;
}

export interface DailyDigestSectionItem {
  kind: "task" | "log";
  task_id?: string;
  space_id?: string;
  space_name?: string;
  title: string;
  meta?: string;
  excerpt?: string;
  due_date?: string;
  priority?: 0 | 1 | 2 | 3;
  progress?: number;
  completed_at?: string;
}

export interface DailyDigestSection {
  key: DailyDigestMetric["key"];
  title: string;
  count: number;
  overflow_count: number;
  items: DailyDigestSectionItem[];
}

export interface DailyDigestSnapshot {
  date: string;
  headline: string;
  metrics: DailyDigestMetric[];
  sections: DailyDigestSection[];
}

export interface AppNotificationData {
  daily_digest?: DailyDigestSnapshot;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body?: string;
  data?: AppNotificationData;
  task_id?: string;
  space_id?: string;
  actor_id?: string;
  actor_email?: string;
  read: boolean;
  created_at: string;
}

export interface NotificationPrefs {
  [type: string]: { inapp: boolean; email: boolean; push: boolean };
}

// ─── Summary Config ─────────────────────────────────────────────────────────────

export interface SummaryDataSource {
  id: string;
  name: string;
  enabled: boolean;
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  body_template?: string;
  response_extract?: string;  // 简易点分路径如 "data.items"
  inject_as: string;          // prompt 模板变量名
  timeout_ms?: number;        // 默认 10000
}

export interface PromptTemplate {
  id: string;           // UUID，内置为 "default"
  name: string;         // 如 "项目日报"、"风险分析"
  system_prompt: string | null;  // null = 用 DEFAULT_SYSTEM_PROMPT
  data_template: string | null;  // null = 用 DEFAULT_DATA_TEMPLATE
  is_builtin?: boolean; // true = 内置模板，不可删除
}

export interface LinkedSpace {
  space_id: string;
  enabled: boolean;
}

export interface SummaryConfig {
  space_id: string;
  system_prompt: string | null;
  data_template: string | null;
  prompt_templates: PromptTemplate[];
  data_sources: SummaryDataSource[];
  linked_spaces: LinkedSpace[];
  updated_at: string;
  updated_by: string | null;
}

// ─── Organizations ──────────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  invite_code?: string;
  created_at: string;
  member_count?: number;
  space_count?: number;
  my_role?: "owner" | "admin" | "member";
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  email: string;
  nickname?: string;
  role: "owner" | "admin" | "member";
  status: "active" | "pending";
  joined_at: string;
}

export type SummaryConfigActionType =
  | "update_prompt"
  | "update_template"
  | "add_datasource"
  | "update_datasource"
  | "remove_datasource"
  | "toggle_datasource"
  | "add_prompt_template"
  | "update_prompt_template"
  | "remove_prompt_template";

export interface ParsedSummaryConfigAction {
  type: SummaryConfigActionType;
  // update_prompt
  new_prompt?: string;
  prompt_changes_description?: string;
  // update_template
  new_template?: string;
  template_changes_description?: string;
  // add/update datasource
  datasource?: Partial<SummaryDataSource>;
  // remove/toggle datasource
  datasource_id?: string;
  datasource_name?: string;
  // toggle
  enabled?: boolean;
  // add/update/remove prompt template
  template?: Partial<PromptTemplate>;
  template_id?: string;
  template_name?: string;
  // client-side toggle state (update vs save-as)
  _originalType?: SummaryConfigActionType;
  _originalTemplateName?: string;
}
