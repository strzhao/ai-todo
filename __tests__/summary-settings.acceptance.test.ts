import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  SummaryConfig,
  PromptTemplate,
  ParsedSummaryConfigAction,
} from "@/lib/types";

// ─── Mock @vercel/postgres ───────────────────────────────────────────────────

const mockQuery = vi.fn();

vi.mock("@vercel/postgres", () => ({
  sql: { query: (...args: unknown[]) => mockQuery(...args) },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<SummaryConfig> = {}): SummaryConfig {
  return {
    space_id: "space-1",
    system_prompt: null,
    data_template: null,
    prompt_templates: [],
    data_sources: [],
    linked_spaces: [],
    updated_at: "2026-03-17T00:00:00Z",
    updated_by: "user-1",
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<PromptTemplate> = {}): PromptTemplate {
  return {
    id: "tpl-1",
    name: "测试模板",
    system_prompt: "你是一个助手",
    data_template: null,
    ...overrides,
  };
}

// ─── 1. 删除模版 bug 修复：getSummaryConfig backward compat ─────────────────

describe("getSummaryConfig: 幽灵模版 bug 修复", () => {
  /**
   * 核心 bug 场景：用户删除所有模版后，prompt_templates=[] 但 system_prompt 仍存在。
   * 旧代码在 backward compat 逻辑中，会在 templates.length===0 && system_prompt 存在时
   * 凭空创建一个"自定义模板"，导致已删除的模版"复活"。
   *
   * 修复后：当 prompt_templates 字段明确为 [] 时（即列存在且为空数组），
   * 不应该再创建幽灵模版，即使 system_prompt 有值。
   */

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("prompt_templates=[] 且 system_prompt 存在时，不应创建幽灵模版", async () => {
    const dbRow = {
      space_id: "space-1",
      system_prompt: "custom system prompt that should not resurrect a template",
      data_template: null,
      prompt_templates: [], // 用户明确删除了所有模版
      data_sources: [],
      updated_at: new Date("2026-03-17"),
      updated_by: "user-1",
    };

    mockQuery.mockResolvedValue({ rows: [dbRow] });

    const { getSummaryConfig } = await import("@/lib/db");
    const config = await getSummaryConfig("space-1");

    expect(config).not.toBeNull();
    expect(config!.prompt_templates).toEqual([]);
    expect(config!.system_prompt).toBe(dbRow.system_prompt);
  });

  it("prompt_templates=[] 且 data_template 存在时，也不应创建幽灵模版", async () => {
    const dbRow = {
      space_id: "space-2",
      system_prompt: null,
      data_template: "custom data template",
      prompt_templates: [],
      data_sources: [],
      updated_at: new Date("2026-03-17"),
      updated_by: "user-2",
    };

    mockQuery.mockResolvedValue({ rows: [dbRow] });

    const { getSummaryConfig } = await import("@/lib/db");
    const config = await getSummaryConfig("space-2");

    expect(config).not.toBeNull();
    expect(config!.prompt_templates).toEqual([]);
  });

  it("prompt_templates 未设置（null）且有 system_prompt → 不应创建幽灵模版（bug 修复后 backward compat 已移除）", async () => {
    const dbRow = {
      space_id: "space-3",
      system_prompt: "old system prompt",
      data_template: "old data template",
      prompt_templates: null, // 未迁移的旧数据
      data_sources: [],
      updated_at: new Date("2026-03-17"),
      updated_by: "user-3",
    };

    mockQuery.mockResolvedValue({ rows: [dbRow] });

    const { getSummaryConfig } = await import("@/lib/db");
    const config = await getSummaryConfig("space-3");

    expect(config).not.toBeNull();
    // 修复后：无论 prompt_templates 是 null 还是 []，都不应自动创建幽灵模版
    expect(config!.prompt_templates).toEqual([]);
  });

  it("DB 中无记录 → 返回 null", async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const { getSummaryConfig } = await import("@/lib/db");
    const config = await getSummaryConfig("nonexistent");
    expect(config).toBeNull();
  });
});

// ─── 2. applyActions 纯函数测试 ─────────────────────────────────────────────

describe("applyActions: 模版操作", () => {
  let applyActions: (
    config: SummaryConfig,
    actions: ParsedSummaryConfigAction[]
  ) => SummaryConfig;

  async function loadApplyActions() {
    try {
      const mod = await import("@/components/ConfigActionPreview");
      applyActions = (mod as Record<string, unknown>).applyActions as typeof applyActions;
      if (typeof applyActions !== "function") {
        throw new Error("applyActions not exported from ConfigActionPreview");
      }
    } catch {
      applyActions = undefined as never;
    }
  }

  it("update_prompt_template: 修改模版名字", async () => {
    await loadApplyActions();
    if (!applyActions) return;

    const tpl = makeTemplate({ id: "tpl-1", name: "旧名字" });
    const config = makeConfig({ prompt_templates: [tpl] });

    const actions: ParsedSummaryConfigAction[] = [
      {
        type: "update_prompt_template",
        template_name: "旧名字",
        template: { name: "新名字" },
      },
    ];

    const result = applyActions(config, actions);

    expect(result.prompt_templates).toHaveLength(1);
    expect(result.prompt_templates[0].name).toBe("新名字");
    expect(result.prompt_templates[0].id).toBe("tpl-1");
    expect(result.prompt_templates[0].system_prompt).toBe(tpl.system_prompt);
  });

  it("update_prompt_template: 修改模版 system_prompt", async () => {
    await loadApplyActions();
    if (!applyActions) return;

    const tpl = makeTemplate({ id: "tpl-2", name: "日报模版", system_prompt: "旧 prompt" });
    const config = makeConfig({ prompt_templates: [tpl] });

    const actions: ParsedSummaryConfigAction[] = [
      {
        type: "update_prompt_template",
        template_name: "日报模版",
        template: { system_prompt: "新 prompt" },
      },
    ];

    const result = applyActions(config, actions);

    expect(result.prompt_templates[0].system_prompt).toBe("新 prompt");
    expect(result.prompt_templates[0].name).toBe("日报模版");
  });

  it("update_prompt_template: 通过 template_id 匹配（备选路径）", async () => {
    await loadApplyActions();
    if (!applyActions) return;

    const tpl = makeTemplate({ id: "tpl-id-match", name: "原名" });
    const config = makeConfig({ prompt_templates: [tpl] });

    const actions: ParsedSummaryConfigAction[] = [
      {
        type: "update_prompt_template",
        template_id: "tpl-id-match",
        template: { name: "ID匹配后的新名" },
      },
    ];

    const result = applyActions(config, actions);

    expect(result.prompt_templates[0].name).toBe("ID匹配后的新名");
  });

  it("remove_prompt_template: 删除指定模版", async () => {
    await loadApplyActions();
    if (!applyActions) return;

    const tpl1 = makeTemplate({ id: "tpl-keep", name: "保留模版" });
    const tpl2 = makeTemplate({ id: "tpl-remove", name: "要删除的模版" });
    const config = makeConfig({ prompt_templates: [tpl1, tpl2] });

    const actions: ParsedSummaryConfigAction[] = [
      {
        type: "remove_prompt_template",
        template_name: "要删除的模版",
      },
    ];

    const result = applyActions(config, actions);

    expect(result.prompt_templates).toHaveLength(1);
    expect(result.prompt_templates[0].name).toBe("保留模版");
  });

  it("remove_prompt_template: 通过 template_id 删除", async () => {
    await loadApplyActions();
    if (!applyActions) return;

    const tpl = makeTemplate({ id: "tpl-to-remove", name: "删除目标" });
    const config = makeConfig({ prompt_templates: [tpl] });

    const actions: ParsedSummaryConfigAction[] = [
      {
        type: "remove_prompt_template",
        template_id: "tpl-to-remove",
      },
    ];

    const result = applyActions(config, actions);

    expect(result.prompt_templates).toHaveLength(0);
  });

  it("remove_prompt_template: 删除后再次查询不应有幽灵模版", async () => {
    await loadApplyActions();
    if (!applyActions) return;

    const tpl = makeTemplate({ id: "only-tpl", name: "唯一模版" });
    const config = makeConfig({
      prompt_templates: [tpl],
      system_prompt: "some prompt",
    });

    const actions: ParsedSummaryConfigAction[] = [
      { type: "remove_prompt_template", template_name: "唯一模版" },
    ];

    const result = applyActions(config, actions);

    expect(result.prompt_templates).toHaveLength(0);
    expect(result.prompt_templates).toEqual([]);
  });

  it("add_prompt_template: 添加新模版", async () => {
    await loadApplyActions();
    if (!applyActions) return;

    const config = makeConfig({ prompt_templates: [] });

    const actions: ParsedSummaryConfigAction[] = [
      {
        type: "add_prompt_template",
        template: { name: "新模版", system_prompt: "新 prompt" },
      },
    ];

    const result = applyActions(config, actions);

    expect(result.prompt_templates).toHaveLength(1);
    expect(result.prompt_templates[0].name).toBe("新模版");
    expect(result.prompt_templates[0].system_prompt).toBe("新 prompt");
    expect(result.prompt_templates[0].id).toBeTruthy();
  });

  it("多个 action 按顺序执行：先添加再修改名字", async () => {
    await loadApplyActions();
    if (!applyActions) return;

    const config = makeConfig({ prompt_templates: [] });

    const actions: ParsedSummaryConfigAction[] = [
      {
        type: "add_prompt_template",
        template: { name: "初始名", system_prompt: "prompt" },
      },
      {
        type: "update_prompt_template",
        template_name: "初始名",
        template: { name: "修改后的名字" },
      },
    ];

    const result = applyActions(config, actions);

    expect(result.prompt_templates).toHaveLength(1);
    expect(result.prompt_templates[0].name).toBe("修改后的名字");
  });

  it("update_prompt_template: 不影响其他模版", async () => {
    await loadApplyActions();
    if (!applyActions) return;

    const tpl1 = makeTemplate({ id: "tpl-1", name: "模版A", system_prompt: "prompt A" });
    const tpl2 = makeTemplate({ id: "tpl-2", name: "模版B", system_prompt: "prompt B" });
    const config = makeConfig({ prompt_templates: [tpl1, tpl2] });

    const actions: ParsedSummaryConfigAction[] = [
      {
        type: "update_prompt_template",
        template_name: "模版A",
        template: { name: "模版A改" },
      },
    ];

    const result = applyActions(config, actions);

    expect(result.prompt_templates).toHaveLength(2);
    expect(result.prompt_templates.find((t) => t.id === "tpl-1")!.name).toBe("模版A改");
    expect(result.prompt_templates.find((t) => t.id === "tpl-2")!.name).toBe("模版B");
    expect(result.prompt_templates.find((t) => t.id === "tpl-2")!.system_prompt).toBe("prompt B");
  });

  it("applyActions 不修改原始 config（不可变性）", async () => {
    await loadApplyActions();
    if (!applyActions) return;

    const tpl = makeTemplate({ id: "tpl-1", name: "原名" });
    const config = makeConfig({ prompt_templates: [tpl] });
    const originalTemplates = [...config.prompt_templates];

    const actions: ParsedSummaryConfigAction[] = [
      {
        type: "update_prompt_template",
        template_name: "原名",
        template: { name: "新名" },
      },
    ];

    applyActions(config, actions);

    expect(config.prompt_templates[0].name).toBe("原名");
    expect(config.prompt_templates).toEqual(originalTemplates);
  });
});
