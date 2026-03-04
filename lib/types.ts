export interface Task {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  due_date?: string; // ISO 8601
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
  // Phase D: hierarchy (max 2 levels)
  parent_id?: string;
}

export interface ParsedTask {
  title: string;
  description?: string;
  due_date?: string;
  priority?: 0 | 1 | 2 | 3;
  tags?: string[];
  // Phase B: @mention
  assignee?: string;
  mentions?: string[];
  // Phase D: hierarchy — subtasks (max 1 level deep in AI output)
  children?: Omit<ParsedTask, "children">[];
}

// Phase C: Project Spaces
export interface Space {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  owner_email: string;
  invite_code: string;
  invite_mode: "open" | "approval";
  created_at: string;
  updated_at: string;
  member_count?: number;
  task_count?: number;
  my_role?: "owner" | "member";
}

export interface SpaceMember {
  id: string;
  space_id: string;
  user_id: string;
  email: string;
  display_name?: string;
  role: "owner" | "member";
  status: "active" | "pending";
  joined_at: string;
}
