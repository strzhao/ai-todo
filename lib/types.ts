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
}

export interface ParsedTask {
  title: string;
  description?: string;
  due_date?: string;
  priority?: 0 | 1 | 2 | 3;
  tags?: string[];
}
