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
  member_count?: number;
  task_count?: number;
  my_role?: "owner" | "admin" | "member";
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
}

export interface ParsedAction {
  type: "create" | "update" | "complete" | "delete" | "add_log" | "move";
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
}

// ─── Notifications ──────────────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body?: string;
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

export interface SummaryConfig {
  space_id: string;
  system_prompt: string | null;
  data_template: string | null;
  data_sources: SummaryDataSource[];
  updated_at: string;
  updated_by: string | null;
}

export type SummaryConfigActionType =
  | "update_prompt"
  | "update_template"
  | "add_datasource"
  | "update_datasource"
  | "remove_datasource"
  | "toggle_datasource";

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
}
