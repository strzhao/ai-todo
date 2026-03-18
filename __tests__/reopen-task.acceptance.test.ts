/**
 * 验收测试：已完成任务支持重新打开
 *
 * 设计文档约定：
 * 1. API：PATCH /api/tasks/[id]，新增 { reopen: true } 请求体，将 status 设回 0，清空 completed_at
 * 2. 数据库：reopenTask(id, userId) 仅重新打开该任务本身（不级联恢复子任务）
 * 3. 前端 UI：已完成区域添加"重新打开"按钮
 * 4. AI 路径：ParsedAction.type 新增 "reopen"，parseActions 能正确解析
 */

import { describe, it, expect } from "vitest";
import { parseActions } from "@/lib/parse-utils";
import type { ParsedAction, ActionResult } from "@/lib/types";

// ── AC-1: 类型定义 ─────────────────────────────────────────────────────────────
// ParsedAction.type 应包含 "reopen" 选项
// 这组测试验证类型层面：reopen action 经 parseActions 解析后的 type 字段值为 "reopen"

describe("AC-1: ParsedAction type 包含 reopen", () => {
  it("parseActions 解析到 reopen type 后，返回 action.type === 'reopen'", () => {
    const result = {
      actions: [
        { type: "reopen", target_id: "uuid-123", target_title: "写周报" },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("reopen");
  });

  it("reopen action 的 type 字段值是字符串 'reopen'，不是其他已有 type", () => {
    const result = {
      actions: [
        { type: "reopen", target_id: "uuid-456" },
      ],
    };
    const actions = parseActions(result, "");
    const action = actions[0];
    // 必须是 reopen，不能被误识别为 complete/delete/update/create/add_log/move
    expect(action.type).not.toBe("complete");
    expect(action.type).not.toBe("delete");
    expect(action.type).not.toBe("update");
    expect(action.type).not.toBe("create");
    expect(action.type).not.toBe("add_log");
    expect(action.type).not.toBe("move");
    expect(action.type).toBe("reopen");
  });
});

// ── AC-2: AI 解析 reopen action ───────────────────────────────────────────────
// parseActions 应正确解析 reopen 类型 action，包含 target_id 和 target_title

describe("AC-2: parseActions 正确解析 reopen action", () => {
  it("reopen action：正确提取 target_id", () => {
    const result = {
      actions: [
        { type: "reopen", target_id: "uuid-reopen-001", target_title: "已完成的任务" },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions[0].target_id).toBe("uuid-reopen-001");
  });

  it("reopen action：正确提取 target_title", () => {
    const result = {
      actions: [
        { type: "reopen", target_id: "uuid-reopen-002", target_title: "写周报" },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions[0].target_title).toBe("写周报");
  });

  it("reopen action：target_id 缺失时不强制填充", () => {
    const result = {
      actions: [
        { type: "reopen", target_title: "某个任务" },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions[0].type).toBe("reopen");
    expect(actions[0].target_id).toBeUndefined();
    expect(actions[0].target_title).toBe("某个任务");
  });

  it("reopen action：target_title 缺失时不强制填充", () => {
    const result = {
      actions: [
        { type: "reopen", target_id: "uuid-only" },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions[0].type).toBe("reopen");
    expect(actions[0].target_id).toBe("uuid-only");
    expect(actions[0].target_title).toBeUndefined();
  });

  it("reopen action 不应带 tasks 字段（不是 create）", () => {
    const result = {
      actions: [
        { type: "reopen", target_id: "uuid-001", target_title: "写周报" },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions[0].tasks).toBeUndefined();
  });

  it("reopen action 不应带 changes 字段（不是 update）", () => {
    const result = {
      actions: [
        { type: "reopen", target_id: "uuid-001" },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions[0].changes).toBeUndefined();
  });

  it("reopen action 不应带 log_content 字段（不是 add_log）", () => {
    const result = {
      actions: [
        { type: "reopen", target_id: "uuid-001" },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions[0].log_content).toBeUndefined();
  });

  it("混合 actions（reopen + create）→ 顺序正确，各类型保留", () => {
    const result = {
      actions: [
        { type: "reopen", target_id: "uuid-old", target_title: "旧任务" },
        { type: "create", tasks: [{ title: "新任务" }] },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe("reopen");
    expect(actions[0].target_id).toBe("uuid-old");
    expect(actions[1].type).toBe("create");
  });

  it("混合 actions（complete + reopen + delete）→ 顺序保持", () => {
    const result = {
      actions: [
        { type: "complete", target_id: "uuid-done" },
        { type: "reopen", target_id: "uuid-reopen", target_title: "要恢复的任务" },
        { type: "delete", target_id: "uuid-del" },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions).toHaveLength(3);
    expect(actions[0].type).toBe("complete");
    expect(actions[1].type).toBe("reopen");
    expect(actions[1].target_id).toBe("uuid-reopen");
    expect(actions[2].type).toBe("delete");
  });

  it("多个 reopen actions → 每个都正确解析", () => {
    const result = {
      actions: [
        { type: "reopen", target_id: "uuid-001", target_title: "任务A" },
        { type: "reopen", target_id: "uuid-002", target_title: "任务B" },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe("reopen");
    expect(actions[0].target_id).toBe("uuid-001");
    expect(actions[1].type).toBe("reopen");
    expect(actions[1].target_id).toBe("uuid-002");
  });
});

// ── AC-3: ActionResult 包含 reopened 字段 ─────────────────────────────────────
// ActionResult 接口应包含 reopened 字段（string[] 类型）

describe("AC-3: ActionResult.reopened 类型验证", () => {
  it("ActionResult 可以赋值 reopened 字段（string[]）", () => {
    // 验证类型层面：如果 ActionResult 不包含 reopened 字段，TypeScript 会报错
    // 通过构造合法对象来验证运行时行为
    const result: ActionResult = {
      reopened: ["task-uuid-001", "task-uuid-002"],
    };
    expect(result.reopened).toBeDefined();
    expect(Array.isArray(result.reopened)).toBe(true);
    expect(result.reopened).toHaveLength(2);
    expect(result.reopened![0]).toBe("task-uuid-001");
    expect(result.reopened![1]).toBe("task-uuid-002");
  });

  it("ActionResult.reopened 为空数组时合法", () => {
    const result: ActionResult = {
      reopened: [],
    };
    expect(result.reopened).toEqual([]);
  });

  it("ActionResult.reopened 可以与其他字段共存", () => {
    const result: ActionResult = {
      created: [],
      updated: [],
      completed: ["uuid-done"],
      deleted: [],
      reopened: ["uuid-reopened"],
    };
    expect(result.reopened).toContain("uuid-reopened");
    expect(result.completed).toContain("uuid-done");
  });

  it("ActionResult.reopened 元素为任务 ID 字符串（非 Task 对象）", () => {
    const result: ActionResult = {
      reopened: ["abc123", "def456"],
    };
    // 每个元素必须是 string 类型（对齐 completed/deleted 字段约定）
    result.reopened!.forEach((id) => {
      expect(typeof id).toBe("string");
    });
  });
});

// ── AC-4: 不级联恢复子任务 ────────────────────────────────────────────────────
// reopenTask 设计要求：仅重新打开单个任务本身，不级联恢复子任务
// 此部分为 API 层行为，需要服务端环境；通过 skip + 描述记录期望行为

describe("AC-4: reopenTask 不级联恢复子任务（API 层）", () => {
  it.skip("PATCH /api/tasks/[id] with { reopen: true } → 返回 200，task.status 变为 0", async () => {
    // 需要服务端环境
    // 验收标准：
    // 1. 请求 PATCH /api/tasks/[id]，body = { reopen: true }
    // 2. 期望返回 200 + { task: { id, status: 0, completed_at: null } }
    // 3. task.status 必须为 0（待办）
    // 4. task.completed_at 必须为 null 或 undefined（清空）
  });

  it.skip("reopenTask(id) 仅重新打开父任务，子任务 status 保持不变", async () => {
    // 需要服务端环境
    // 验收标准：
    // 假设场景：父任务 A（status=2，已完成）有子任务 B（status=2，已完成）
    // 调用 reopenTask(A.id) 后：
    // - A.status 应变为 0
    // - B.status 应仍为 2（不级联恢复）
    // 这与 completeTask 的行为相反（completeTask 会级联完成子任务）
  });

  it.skip("已是待办状态的任务调用 reopen → 幂等操作，返回 200，status 仍为 0", async () => {
    // 需要服务端环境
    // 验收标准：对 status=0 的任务调用 reopen 不应报错，应幂等成功
  });

  it.skip("无权限用户无法 reopen 他人任务 → 返回 401 或 403", async () => {
    // 需要服务端环境
    // 验收标准：不同 user_id 的请求应被拒绝
  });
});

// ── AC-5: UI 重新打开按钮（前端层）────────────────────────────────────────────

describe("AC-5: 已完成区域提供重新打开 UI（前端层）", () => {
  it.skip("已完成任务列表中，每个任务应渲染重新打开按钮", () => {
    // 需要 React 测试环境（@testing-library/react）
    // 验收标准：
    // 1. 渲染 TaskItem 组件，status=2（已完成）
    // 2. 查找包含"重新打开"文字的按钮
    // 3. 点击按钮后，应调用 PATCH /api/tasks/[id] with { reopen: true }
  });

  it.skip("点击重新打开后，任务从已完成区域移入待办区域", () => {
    // 需要 React 测试环境
    // 验收标准：
    // 1. Mock API 返回成功
    // 2. 点击重新打开后，组件应触发列表刷新
    // 3. 该任务不再出现在已完成折叠区域
  });
});

// ── AC-6: AI 自然语言路径端到端（集成层）────────────────────────────────────

describe("AC-6: AI 自然语言 reopen 路径（集成层）", () => {
  it.skip("NLInput 输入'重新打开写周报' → AI 返回 reopen action → ActionPreview 展示 → 执行后 status=0", () => {
    // 需要完整的 Next.js 环境 + DeepSeek API
    // 验收标准：
    // 1. POST /api/parse-task，body = { text: "重新打开写周报", tasks: [...] }
    // 2. AI 返回 { actions: [{ type: "reopen", target_id: "...", target_title: "写周报" }] }
    // 3. ActionPreview 渲染"重新打开"操作预览
    // 4. 用户确认后执行，PATCH /api/tasks/[id] { reopen: true } 成功
    // 5. 任务 status 变为 0，从已完成区域移出
  });

  it.skip("AI 支持多种重新打开表达方式：重新打开/恢复/reopen/重做", () => {
    // 需要完整的 Next.js + DeepSeek API 环境
    // 验收标准：以上关键词都应被 AI 解析为 type: "reopen"，不解析为其他类型
  });
});
