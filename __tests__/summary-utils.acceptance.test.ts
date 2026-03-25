import { describe, it, expect } from "vitest";
import type { Task, TaskLog } from "@/lib/types";
import {
  allocateCharBudget,
  getActiveTaskIds,
  getAncestorIds,
  filterRecentLogs,
  truncateText,
  buildCompressedSpaceText,
  MAIN_SPACE_CHAR_LIMIT,
  LINKED_SPACES_TOTAL_CHAR_LIMIT,
  MIN_SPACE_CHAR_LIMIT,
} from "@/lib/summary-utils";

// ── 工厂函数 ─────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: crypto.randomUUID(),
    user_id: "user-1",
    title: "测试任务",
    priority: 2,
    status: 0,
    tags: [],
    sort_order: 0,
    created_at: "2026-03-19T00:00:00Z",
    progress: 0,
    ...overrides,
  } as Task;
}

function makeLog(overrides: Partial<TaskLog> = {}): TaskLog {
  return {
    id: crypto.randomUUID(),
    task_id: "task-1",
    user_id: "user-1",
    user_email: "test@example.com",
    content: "测试日志",
    created_at: "2026-03-19T10:00:00Z",
    ...overrides,
  };
}

// ── 常量检查 ─────────────────────────────────────────────────────────────────

describe("常量", () => {
  it("MAIN_SPACE_CHAR_LIMIT 应为合理的主空间预算", () => {
    expect(MAIN_SPACE_CHAR_LIMIT).toBeGreaterThanOrEqual(15000);
    expect(MAIN_SPACE_CHAR_LIMIT).toBeLessThanOrEqual(50000);
  });

  it("LINKED_SPACES_TOTAL_CHAR_LIMIT = 15000", () => {
    expect(LINKED_SPACES_TOTAL_CHAR_LIMIT).toBe(15000);
  });

  it("MIN_SPACE_CHAR_LIMIT = 2000", () => {
    expect(MIN_SPACE_CHAR_LIMIT).toBe(2000);
  });
});

// ── 预算分配 ─────────────────────────────────────────────────────────────────

describe("allocateCharBudget", () => {
  it("1 个空间 → 全部预算 15000", () => {
    expect(allocateCharBudget(15000, 1)).toBe(15000);
  });

  it("3 个空间 → 平均分配 5000/个", () => {
    expect(allocateCharBudget(15000, 3)).toBe(5000);
  });

  it("10 个空间 → 达到最低限制 2000/个", () => {
    // 15000 / 10 = 1500 < 2000, 应钳位到 2000
    expect(allocateCharBudget(15000, 10)).toBe(2000);
  });

  it("0 个空间 → 0", () => {
    expect(allocateCharBudget(15000, 0)).toBe(0);
  });
});

// ── 活跃任务识别 ─────────────────────────────────────────────────────────────

describe("getActiveTaskIds", () => {
  const today = "2026-03-19";

  it("有近 3 天日志的任务被标记为活跃", () => {
    const task = makeTask({ id: "t1" });
    const log = makeLog({
      task_id: "t1",
      created_at: "2026-03-18T12:00:00Z", // 昨天
    });
    const result = getActiveTaskIds([task], [log], today);
    expect(result.has("t1")).toBe(true);
  });

  it("今日完成的任务被标记为活跃", () => {
    const task = makeTask({
      id: "t2",
      status: 2,
      completed_at: "2026-03-19T08:00:00Z",
    });
    const result = getActiveTaskIds([task], [], today);
    expect(result.has("t2")).toBe(true);
  });

  it("超过 3 天前的日志不算活跃", () => {
    const task = makeTask({ id: "t3" });
    const log = makeLog({
      task_id: "t3",
      created_at: "2026-03-15T12:00:00Z", // 4 天前
    });
    const result = getActiveTaskIds([task], [log], today);
    expect(result.has("t3")).toBe(false);
  });

  it("无日志且未今日完成的任务不活跃", () => {
    const task = makeTask({ id: "t4", status: 0 });
    const result = getActiveTaskIds([task], [], today);
    expect(result.has("t4")).toBe(false);
  });

  it("3 天前边界日的日志仍算活跃（含当天）", () => {
    const task = makeTask({ id: "t5" });
    const log = makeLog({
      task_id: "t5",
      created_at: "2026-03-17T00:00:00Z", // 2 天前（3天窗口内）
    });
    const result = getActiveTaskIds([task], [log], today);
    expect(result.has("t5")).toBe(true);
  });

  it("自定义 days 参数覆盖默认 3 天", () => {
    const task = makeTask({ id: "t6" });
    const log = makeLog({
      task_id: "t6",
      created_at: "2026-03-12T12:00:00Z", // 7 天前
    });
    // days=10 应该包含
    const result = getActiveTaskIds([task], [log], today, 10);
    expect(result.has("t6")).toBe(true);
  });
});

// ── 祖先链 ───────────────────────────────────────────────────────────────────

describe("getAncestorIds", () => {
  it("活跃任务的父任务和祖父任务都在返回集合中", () => {
    const grandparent = makeTask({ id: "gp", parent_id: undefined });
    const parent = makeTask({ id: "p", parent_id: "gp" });
    const child = makeTask({ id: "c", parent_id: "p" });
    const tasks = [grandparent, parent, child];

    const ancestors = getAncestorIds("c", tasks);
    expect(ancestors).toContain("p");
    expect(ancestors).toContain("gp");
  });

  it("根任务没有祖先", () => {
    const root = makeTask({ id: "root", parent_id: undefined });
    const ancestors = getAncestorIds("root", [root]);
    expect(ancestors).toHaveLength(0);
  });

  it("3 层嵌套返回正确祖先链", () => {
    const a = makeTask({ id: "a" });
    const b = makeTask({ id: "b", parent_id: "a" });
    const c = makeTask({ id: "c", parent_id: "b" });
    const d = makeTask({ id: "d", parent_id: "c" });

    const ancestors = getAncestorIds("d", [a, b, c, d]);
    expect(ancestors).toEqual(expect.arrayContaining(["a", "b", "c"]));
    expect(ancestors).toHaveLength(3);
  });
});

// ── 日志过滤 ─────────────────────────────────────────────────────────────────

describe("filterRecentLogs", () => {
  const today = "2026-03-19";

  it("只保留最近 N 天的日志", () => {
    const recentLog = makeLog({ created_at: "2026-03-18T10:00:00Z" });
    const oldLog = makeLog({ created_at: "2026-03-10T10:00:00Z" });
    const result = filterRecentLogs([recentLog, oldLog], today, 3, 10);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(recentLog.id);
  });

  it("每个任务最多 maxPerTask 条日志", () => {
    const logs = Array.from({ length: 5 }, (_, i) =>
      makeLog({
        task_id: "same-task",
        created_at: `2026-03-19T${String(10 + i).padStart(2, "0")}:00:00Z`,
      })
    );
    const result = filterRecentLogs(logs, today, 3, 3);
    expect(result).toHaveLength(3);
  });

  it("按时间倒序保留最新的", () => {
    const logs = Array.from({ length: 5 }, (_, i) =>
      makeLog({
        task_id: "same-task",
        content: `日志${i}`,
        created_at: `2026-03-19T${String(10 + i).padStart(2, "0")}:00:00Z`,
      })
    );
    const result = filterRecentLogs(logs, today, 3, 3);
    // 最新的 3 条应该是 14:00, 13:00, 12:00
    expect(result[0].content).toBe("日志4");
    expect(result[1].content).toBe("日志3");
    expect(result[2].content).toBe("日志2");
  });

  it("空日志数组返回空", () => {
    const result = filterRecentLogs([], today, 3, 3);
    expect(result).toHaveLength(0);
  });
});

// ── 文本截断 ─────────────────────────────────────────────────────────────────

describe("truncateText", () => {
  it("短文本不截断", () => {
    const text = "短文本";
    expect(truncateText(text, 100)).toBe(text);
  });

  it("超长文本截断到指定字符数", () => {
    const text = "这是一段很长的文本".repeat(100);
    const result = truncateText(text, 50);
    // 截断后总长度不应超过 maxChars + 提示文本的长度
    // 但核心内容部分应 <= maxChars
    expect(result.length).toBeLessThan(text.length);
  });

  it("截断后包含'数据已截断'提示", () => {
    const text = "这是一段很长的文本".repeat(100);
    const result = truncateText(text, 50);
    expect(result).toContain("截断");
  });

  it("恰好等于限制的文本不截断", () => {
    const text = "12345";
    expect(truncateText(text, 5)).toBe(text);
  });
});

// ── 压缩空间文本集成 ─────────────────────────────────────────────────────────

describe("buildCompressedSpaceText", () => {
  const today = "2026-03-19";
  const nameMap = new Map([
    ["user-1", "张三"],
    ["user-2", "李四"],
  ]);

  it("输出包含空间标题", () => {
    const task = makeTask({ id: "t1", space_id: "space-1" });
    const result = buildCompressedSpaceText(
      "项目Alpha",
      [task],
      [],
      today,
      nameMap,
      5000
    );
    expect(result).toContain("项目Alpha");
  });

  it("输出包含统计信息", () => {
    const tasks = [
      makeTask({ status: 0 }),
      makeTask({ status: 2, completed_at: "2026-03-19T08:00:00Z" }),
      makeTask({ status: 2, completed_at: "2026-03-18T08:00:00Z" }),
    ];
    const result = buildCompressedSpaceText(
      "项目Beta",
      tasks,
      [],
      today,
      nameMap,
      5000
    );
    // 应包含总数或完成率之类的统计
    expect(result).toMatch(/[0-9]/); // 至少包含数字
  });

  it("大规模场景：5 空间 × 200 任务 × 100 日志，压缩后 < 15000 字", () => {
    const allTexts: string[] = [];
    const perSpaceBudget = allocateCharBudget(15000, 5);

    for (let s = 0; s < 5; s++) {
      const spaceId = `space-${s}`;
      const tasks: Task[] = [];
      const logs: TaskLog[] = [];

      // 200 个任务，部分有父子关系
      for (let i = 0; i < 200; i++) {
        tasks.push(
          makeTask({
            id: `${spaceId}-t${i}`,
            space_id: spaceId,
            title: `任务${i}_${"详细描述".repeat(5)}`,
            parent_id: i > 0 && i % 5 === 0 ? `${spaceId}-t${i - 1}` : undefined,
            status: i % 10 === 0 ? 2 : 0,
            completed_at:
              i % 10 === 0 ? "2026-03-19T08:00:00Z" : undefined,
          })
        );
      }

      // 100 条日志
      for (let j = 0; j < 100; j++) {
        logs.push(
          makeLog({
            task_id: `${spaceId}-t${j % 50}`,
            content: `进展日志${j}_${"内容补充".repeat(10)}`,
            created_at: `2026-03-${String(17 + (j % 3)).padStart(2, "0")}T10:00:00Z`,
          })
        );
      }

      const text = buildCompressedSpaceText(
        `空间${s}`,
        tasks,
        logs,
        today,
        nameMap,
        perSpaceBudget
      );
      allTexts.push(text);
    }

    const totalChars = allTexts.reduce((sum, t) => sum + t.length, 0);
    expect(totalChars).toBeLessThan(15000);
  });

  it("空数据不会崩溃", () => {
    const result = buildCompressedSpaceText(
      "空项目",
      [],
      [],
      today,
      nameMap,
      5000
    );
    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
  });

  it("只有 1 个任务且无日志时正常工作", () => {
    const task = makeTask({
      id: "solo",
      title: "唯一任务",
      status: 0,
    });
    const result = buildCompressedSpaceText(
      "小项目",
      [task],
      [],
      today,
      nameMap,
      5000
    );
    expect(result).toContain("唯一任务");
  });

  it("输出不超过 maxChars 限制", () => {
    const tasks = Array.from({ length: 50 }, (_, i) =>
      makeTask({
        id: `t${i}`,
        title: `任务${i}的很长标题${"描述".repeat(20)}`,
      })
    );
    const logs = Array.from({ length: 30 }, (_, i) =>
      makeLog({
        task_id: `t${i % 10}`,
        content: `很长的日志内容${"补充".repeat(30)}`,
        created_at: "2026-03-19T10:00:00Z",
      })
    );

    const maxChars = 3000;
    const result = buildCompressedSpaceText(
      "限制测试",
      tasks,
      logs,
      today,
      nameMap,
      maxChars
    );
    expect(result.length).toBeLessThanOrEqual(maxChars);
  });
});
