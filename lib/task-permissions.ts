export type TaskRole = "creator" | "assignee" | "space_owner" | "space_admin" | "space_member";

export type TaskOperation =
  | "update_title" | "update_description" | "update_priority"
  | "update_dates" | "update_tags" | "update_assignee"
  | "update_progress" | "update_type" | "move"
  | "complete" | "reopen" | "delete" | "add_log";

export class TaskPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskPermissionError";
  }
}

// 权限矩阵（数据驱动）
const PERMISSION_MATRIX: Record<TaskOperation, TaskRole[]> = {
  update_title: ["creator", "space_owner"],
  update_description: ["creator", "assignee", "space_owner"],
  update_priority: ["creator", "space_owner"],
  update_dates: ["creator", "assignee", "space_owner"],
  update_tags: ["creator", "assignee", "space_owner"],
  update_assignee: ["creator", "space_owner", "space_admin"],
  update_progress: ["creator", "assignee", "space_owner"],
  update_type: ["creator", "space_owner"],
  move: ["creator", "space_owner"],
  complete: ["creator", "assignee", "space_owner"],
  reopen: ["creator", "assignee", "space_owner"],
  delete: ["creator", "space_owner"],
  add_log: ["creator", "assignee", "space_owner", "space_admin", "space_member"],
};

// 计算用户相对于任务的角色
export function getTaskRoles(
  task: { user_id: string; assignee_id?: string; space_id?: string },
  userId: string,
  memberRole?: string  // from ai_todo_task_members.role
): TaskRole[] {
  const roles: TaskRole[] = [];
  if (task.user_id === userId) roles.push("creator");
  if (task.assignee_id === userId) roles.push("assignee");
  if (task.space_id && memberRole) {
    if (memberRole === "owner") roles.push("space_owner");
    else if (memberRole === "admin") roles.push("space_admin");
    else roles.push("space_member");
  }
  return roles;
}

export function checkTaskPermission(roles: TaskRole[], operation: TaskOperation): boolean {
  const allowed = PERMISSION_MATRIX[operation];
  return roles.some((r) => allowed.includes(r));
}

// 将 patch key 映射到 operation
const FIELD_OPERATION_MAP: Record<string, TaskOperation> = {
  title: "update_title",
  description: "update_description",
  priority: "update_priority",
  due_date: "update_dates",
  start_date: "update_dates",
  end_date: "update_dates",
  tags: "update_tags",
  assignee_email: "update_assignee",
  assigneeEmail: "update_assignee",
  progress: "update_progress",
  type: "update_type",
  parent_id: "move",
};

// 检查 patch 中有哪些字段不允许修改，返回不允许的字段名数组
export function getDisallowedFields(roles: TaskRole[], patchKeys: string[]): string[] {
  const disallowed: string[] = [];
  for (const key of patchKeys) {
    const op = FIELD_OPERATION_MAP[key];
    if (op && !checkTaskPermission(roles, op)) {
      disallowed.push(key);
    }
  }
  return disallowed;
}

// 生成中文错误信息
const OPERATION_LABELS: Record<TaskOperation, string> = {
  update_title: "修改标题",
  update_description: "修改描述",
  update_priority: "修改优先级",
  update_dates: "修改日期",
  update_tags: "修改标签",
  update_assignee: "修改经办人",
  update_progress: "修改进度",
  update_type: "修改类型",
  move: "移动任务",
  complete: "完成任务",
  reopen: "重新打开任务",
  delete: "删除任务",
  add_log: "添加进展",
};

export function buildPermissionErrorMessage(disallowedFields: string[]): string {
  const ops = new Set<TaskOperation>();
  for (const field of disallowedFields) {
    const op = FIELD_OPERATION_MAP[field];
    if (op) ops.add(op);
  }
  const labels = [...ops].map((op) => OPERATION_LABELS[op]);
  return `无权${labels.join("、")}，只有任务创建者或空间所有者可以操作`;
}

export function buildOperationErrorMessage(operation: TaskOperation): string {
  return `无权${OPERATION_LABELS[operation]}，只有${getPermissionHint(operation)}可以操作`;
}

function getPermissionHint(operation: TaskOperation): string {
  const roles = PERMISSION_MATRIX[operation];
  const hints: string[] = [];
  if (roles.includes("creator")) hints.push("任务创建者");
  if (roles.includes("assignee")) hints.push("经办人");
  if (roles.includes("space_owner")) hints.push("空间所有者");
  if (roles.includes("space_admin")) hints.push("空间管理员");
  return hints.join("、");
}
