import { describe, it, expect, beforeEach } from "vitest";
import { parseItem, parseActions, getNowMinuteKey, cleanupCache, parseCache } from "@/lib/parse-utils";

// ── parseItem ─────────────────────────────────────────────────────────────────

describe("parseItem", () => {
  it("完整字段正确映射", () => {
    const result = parseItem(
      {
        title: "写周报",
        description: "需要包含本周进展",
        priority: 1,
        tags: ["工作", "写作"],
        assignee: "alice@example.com",
        mentions: ["bob@example.com"],
        due_date: "2026-03-20T00:00:00Z",
      },
      "fallback"
    );
    expect(result.title).toBe("写周报");
    expect(result.description).toBe("需要包含本周进展");
    expect(result.priority).toBe(1);
    expect(result.tags).toEqual(["工作", "写作"]);
    expect(result.assignee).toBe("alice@example.com");
    expect(result.mentions).toEqual(["bob@example.com"]);
    expect(result.due_date).toBe("2026-03-20T00:00:00Z");
  });

  it("title 缺失时使用 fallbackTitle", () => {
    const result = parseItem({}, "我的备用标题");
    expect(result.title).toBe("我的备用标题");
  });

  it("title 为空字符串时使用 fallbackTitle", () => {
    const result = parseItem({ title: "" }, "fallback");
    expect(result.title).toBe("fallback");
  });

  it("priority 越界（5）→ 默认 2", () => {
    expect(parseItem({ priority: 5 }, "t").priority).toBe(2);
  });

  it("priority 为负数 → 默认 2", () => {
    expect(parseItem({ priority: -1 }, "t").priority).toBe(2);
  });

  it("priority 合法边界值（0/1/2/3）→ 保留", () => {
    expect(parseItem({ priority: 0 }, "t").priority).toBe(0);
    expect(parseItem({ priority: 1 }, "t").priority).toBe(1);
    expect(parseItem({ priority: 2 }, "t").priority).toBe(2);
    expect(parseItem({ priority: 3 }, "t").priority).toBe(3);
  });

  it("priority 为字符串 '1' → 默认 2（类型不符）", () => {
    expect(parseItem({ priority: "1" }, "t").priority).toBe(2);
  });

  it("tags 非数组 → 返回 []", () => {
    expect(parseItem({ tags: "single" }, "t").tags).toEqual([]);
    expect(parseItem({ tags: null }, "t").tags).toEqual([]);
    expect(parseItem({}, "t").tags).toEqual([]);
  });

  it("tags 包含非字符串元素 → 转为字符串", () => {
    expect(parseItem({ tags: [1, "tag", true] }, "t").tags).toEqual(["1", "tag", "true"]);
  });

  it("mentions 为空数组 → 结果中无 mentions 字段", () => {
    const result = parseItem({ mentions: [] }, "t");
    expect(result.mentions).toBeUndefined();
  });

  it("多余字段不出现在结果中", () => {
    const result = parseItem({ title: "t", extra_field: "should_be_ignored" }, "t") as Record<string, unknown>;
    expect(result.extra_field).toBeUndefined();
  });
});

// ── getNowMinuteKey ───────────────────────────────────────────────────────────

describe("getNowMinuteKey", () => {
  it("有效 ISO 时间 → 截断到分钟", () => {
    expect(getNowMinuteKey("2026-03-04T14:35:42.123Z")).toBe("2026-03-04T14:35");
  });

  it("无效格式 → 直接返回原值", () => {
    expect(getNowMinuteKey("invalid")).toBe("invalid");
    expect(getNowMinuteKey("")).toBe("");
  });
});

// ── parseActions ──────────────────────────────────────────────────────────────

describe("parseActions - 新格式", () => {
  it("单个 create action，含 tasks 数组", () => {
    const result = {
      actions: [
        { type: "create", tasks: [{ title: "任务A" }, { title: "任务B" }] },
      ],
    };
    const actions = parseActions(result, "user input");
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("create");
    expect(actions[0].tasks).toHaveLength(2);
    expect(actions[0].tasks![0].title).toBe("任务A");
  });

  it("create action 含子任务 children", () => {
    const result = {
      actions: [
        {
          type: "create",
          tasks: [
            {
              title: "父任务",
              children: [{ title: "子任务1" }, { title: "子任务2" }],
            },
          ],
        },
      ],
    };
    const actions = parseActions(result, "");
    const parent = actions[0].tasks![0];
    expect(parent.title).toBe("父任务");
    expect(parent.children).toHaveLength(2);
    expect(parent.children![0].title).toBe("子任务1");
  });

  it("complete action：正确提取 target_id 和 target_title", () => {
    const result = {
      actions: [
        { type: "complete", target_id: "uuid-123", target_title: "调研任务" },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions[0].type).toBe("complete");
    expect(actions[0].target_id).toBe("uuid-123");
    expect(actions[0].target_title).toBe("调研任务");
  });

  it("delete action：正确提取", () => {
    const result = {
      actions: [{ type: "delete", target_id: "uuid-del", target_title: "旧任务" }],
    };
    const actions = parseActions(result, "");
    expect(actions[0].type).toBe("delete");
    expect(actions[0].target_id).toBe("uuid-del");
  });

  it("update action：changes 嵌套字段（priority/title/due_date）", () => {
    const result = {
      actions: [
        {
          type: "update",
          target_id: "uuid-upd",
          changes: { priority: 0, title: "新标题", due_date: "2026-03-25T00:00:00Z" },
        },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions[0].type).toBe("update");
    expect(actions[0].changes?.priority).toBe(0);
    expect(actions[0].changes?.title).toBe("新标题");
    expect(actions[0].changes?.due_date).toBe("2026-03-25T00:00:00Z");
  });

  it("update changes.priority 为字符串 → 不出现在 changes 中", () => {
    const result = {
      actions: [
        { type: "update", target_id: "id1", changes: { priority: "1" } },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions[0].changes?.priority).toBeUndefined();
  });

  it("update changes.tags 为数组 → 正确提取", () => {
    const result = {
      actions: [
        { type: "update", target_id: "id1", changes: { tags: ["工作", "重要"] } },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions[0].changes?.tags).toEqual(["工作", "重要"]);
  });

  it("add_log action：含 log_content", () => {
    const result = {
      actions: [
        { type: "add_log", target_id: "uuid-log", target_title: "项目计划", log_content: "完成第一阶段" },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions[0].type).toBe("add_log");
    expect(actions[0].log_content).toBe("完成第一阶段");
  });

  it("move action：正确提取 source 和目标父任务", () => {
    const result = {
      actions: [
        {
          type: "move",
          target_id: "uuid-src",
          target_title: "调研任务",
          to_parent_id: "uuid-parent",
          to_parent_title: "项目计划",
        },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions[0].type).toBe("move");
    expect(actions[0].target_id).toBe("uuid-src");
    expect(actions[0].to_parent_id).toBe("uuid-parent");
    expect(actions[0].to_parent_title).toBe("项目计划");
  });

  it("move action：to_parent 缺失时不强制填充", () => {
    const result = {
      actions: [
        {
          type: "move",
          target_id: "uuid-src",
          target_title: "调研任务",
        },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions[0].type).toBe("move");
    expect(actions[0].to_parent_id).toBeUndefined();
    expect(actions[0].to_parent_title).toBeUndefined();
  });

  it("混合 actions（create + complete）→ 返回 2 个 action", () => {
    const result = {
      actions: [
        { type: "create", tasks: [{ title: "新任务" }] },
        { type: "complete", target_id: "uuid-done", target_title: "旧任务" },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe("create");
    expect(actions[1].type).toBe("complete");
  });

  it("create tasks 为空数组", () => {
    const result = {
      actions: [{ type: "create", tasks: [] }],
    };
    const actions = parseActions(result, "fallback");
    expect(actions[0].type).toBe("create");
    expect(actions[0].tasks).toHaveLength(0);
  });

  it("混合 actions（move + create + complete）顺序保持", () => {
    const result = {
      actions: [
        { type: "move", target_id: "uuid-src", to_parent_id: "uuid-parent" },
        { type: "create", tasks: [{ title: "新任务" }] },
        { type: "complete", target_id: "uuid-done", target_title: "旧任务" },
      ],
    };
    const actions = parseActions(result, "");
    expect(actions).toHaveLength(3);
    expect(actions[0].type).toBe("move");
    expect(actions[1].type).toBe("create");
    expect(actions[2].type).toBe("complete");
  });
});

describe("parseActions - 旧格式兼容", () => {
  it("{ tasks: [...] } → 包装为单个 create action", () => {
    const result = { tasks: [{ title: "Task1" }, { title: "Task2" }] };
    const actions = parseActions(result, "fallback");
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("create");
    expect(actions[0].tasks).toHaveLength(2);
    expect(actions[0].tasks![0].title).toBe("Task1");
  });

  it("result.actions 不是数组 → fallback 到旧格式", () => {
    const result = { actions: "not_an_array", tasks: [{ title: "任务" }] };
    const actions = parseActions(result, "");
    expect(actions[0].type).toBe("create");
    expect(actions[0].tasks![0].title).toBe("任务");
  });

  it("旧格式第一个任务 title 用 fallbackText，后续用 '任务 N'", () => {
    const result = { tasks: [{}, {}] };
    const actions = parseActions(result, "用户的原始输入");
    expect(actions[0].tasks![0].title).toBe("用户的原始输入");
    expect(actions[0].tasks![1].title).toBe("任务 2");
  });
});

// ── cleanupCache ──────────────────────────────────────────────────────────────

describe("cleanupCache", () => {
  beforeEach(() => {
    parseCache.clear();
  });

  it("删除已过期的条目", () => {
    const now = Date.now();
    parseCache.set("expired", { expiresAt: now - 1000, actions: [] });
    parseCache.set("valid", { expiresAt: now + 60000, actions: [] });
    cleanupCache(now);
    expect(parseCache.has("expired")).toBe(false);
    expect(parseCache.has("valid")).toBe(true);
  });

  it("空 cache 无副作用", () => {
    expect(() => cleanupCache()).not.toThrow();
    expect(parseCache.size).toBe(0);
  });
});
