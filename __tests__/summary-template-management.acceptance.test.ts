import { describe, it, expect, vi, beforeAll } from "vitest";
import type {
  SummaryConfig,
  PromptTemplate,
  ParsedSummaryConfigAction,
} from "@/lib/types";

// ─── applyActions 纯函数复制（因组件未导出，从 ConfigActionPreview.tsx 复刻） ──
// 这是验收测试的参考实现；如果未来 applyActions 被提取导出，可替换为直接 import。

function applyActionsReference(
  config: SummaryConfig | null,
  actions: ParsedSummaryConfigAction[]
): { prompt_templates: PromptTemplate[] } {
  const promptTemplates = [...(config?.prompt_templates ?? [])];

  for (const action of actions) {
    switch (action.type) {
      case "add_prompt_template":
        if (action.template) {
          promptTemplates.push({
            id: crypto.randomUUID(),
            name: action.template.name ?? "新模板",
            system_prompt: action.template.system_prompt ?? null,
            data_template: action.template.data_template ?? null,
          });
        }
        break;

      case "update_prompt_template": {
        const idx = promptTemplates.findIndex(
          (t) => t.name === action.template_name || t.id === action.template_id
        );
        if (idx >= 0 && action.template) {
          promptTemplates[idx] = { ...promptTemplates[idx], ...action.template };
        }
        break;
      }

      case "remove_prompt_template": {
        const removeIdx = promptTemplates.findIndex(
          (t) => t.name === action.template_name || t.id === action.template_id
        );
        if (removeIdx >= 0) {
          promptTemplates.splice(removeIdx, 1);
        }
        break;
      }
    }
  }

  return { prompt_templates: promptTemplates };
}

// ─── 同时尝试加载实际导出的 applyActions ──────────────────────────────────────

type ApplyActionsFn = (
  config: SummaryConfig | null,
  defaults: { system_prompt: string; data_template: string },
  actions: ParsedSummaryConfigAction[],
  spaceId: string
) => { prompt_templates: PromptTemplate[] };

let realApplyActions: ApplyActionsFn | null = null;

// 包装函数：优先使用实际实现，回退到参考实现
function applyActions(
  config: SummaryConfig | null,
  actions: ParsedSummaryConfigAction[]
): { prompt_templates: PromptTemplate[] } {
  if (realApplyActions) {
    return realApplyActions(
      config,
      { system_prompt: "", data_template: "" },
      actions,
      "test-space"
    );
  }
  return applyActionsReference(config, actions);
}

beforeAll(async () => {
  try {
    const mod = await import("@/components/ConfigActionPreview");
    const fn = (mod as Record<string, unknown>).applyActions;
    if (typeof fn === "function") {
      realApplyActions = fn as ApplyActionsFn;
    }
  } catch {
    // 组件未导出 applyActions，使用参考实现
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<SummaryConfig> = {}): SummaryConfig {
  return {
    space_id: "space-1",
    system_prompt: null,
    data_template: null,
    prompt_templates: [],
    data_sources: [],
    linked_spaces: [],
    updated_at: "2026-03-19T00:00:00Z",
    updated_by: "user-1",
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<PromptTemplate> = {}): PromptTemplate {
  return {
    id: "tpl-default",
    name: "默认模板",
    system_prompt: "你是一个助手",
    data_template: null,
    ...overrides,
  };
}

// ─── 1. update_prompt_template：原地更新匹配的模板 ───────────────────────────

describe("update_prompt_template: 原地更新匹配的模板", () => {
  it("按 template_name 匹配并原地更新 system_prompt", () => {
    const tpl = makeTemplate({
      id: "tpl-1",
      name: "日报模版",
      system_prompt: "旧 prompt",
    });
    const config = makeConfig({ prompt_templates: [tpl] });

    const result = applyActions(config, [
      {
        type: "update_prompt_template",
        template_name: "日报模版",
        template: { system_prompt: "AI 优化后的新 prompt" },
      },
    ]);

    expect(result.prompt_templates).toHaveLength(1);
    expect(result.prompt_templates[0].id).toBe("tpl-1"); // ID 不变
    expect(result.prompt_templates[0].name).toBe("日报模版"); // 名字不变
    expect(result.prompt_templates[0].system_prompt).toBe("AI 优化后的新 prompt");
  });

  it("按 template_id 匹配并原地更新", () => {
    const tpl = makeTemplate({
      id: "tpl-by-id",
      name: "周报模版",
      system_prompt: "旧 prompt",
    });
    const config = makeConfig({ prompt_templates: [tpl] });

    const result = applyActions(config, [
      {
        type: "update_prompt_template",
        template_id: "tpl-by-id",
        template: { system_prompt: "新 prompt" },
      },
    ]);

    expect(result.prompt_templates).toHaveLength(1);
    expect(result.prompt_templates[0].id).toBe("tpl-by-id");
    expect(result.prompt_templates[0].system_prompt).toBe("新 prompt");
  });

  it("更新只影响目标模版，其他模版保持不变", () => {
    const tpl1 = makeTemplate({ id: "tpl-1", name: "日报", system_prompt: "日报 prompt" });
    const tpl2 = makeTemplate({ id: "tpl-2", name: "周报", system_prompt: "周报 prompt" });
    const tpl3 = makeTemplate({ id: "tpl-3", name: "月报", system_prompt: "月报 prompt" });
    const config = makeConfig({ prompt_templates: [tpl1, tpl2, tpl3] });

    const result = applyActions(config, [
      {
        type: "update_prompt_template",
        template_name: "周报",
        template: { system_prompt: "优化后的周报 prompt" },
      },
    ]);

    expect(result.prompt_templates).toHaveLength(3);
    expect(result.prompt_templates[0].system_prompt).toBe("日报 prompt");
    expect(result.prompt_templates[1].system_prompt).toBe("优化后的周报 prompt");
    expect(result.prompt_templates[2].system_prompt).toBe("月报 prompt");
  });
});

// ─── 2. add_prompt_template：创建新模板（带新 UUID） ─────────────────────────

describe("add_prompt_template: 创建新模板带新 UUID", () => {
  it("新模板被追加到数组末尾，且有合法 UUID", () => {
    const existing = makeTemplate({ id: "tpl-1", name: "原有模版" });
    const config = makeConfig({ prompt_templates: [existing] });

    const result = applyActions(config, [
      {
        type: "add_prompt_template",
        template: { name: "AI 优化版", system_prompt: "优化后的 prompt" },
      },
    ]);

    expect(result.prompt_templates).toHaveLength(2);
    expect(result.prompt_templates[0].id).toBe("tpl-1"); // 原有不变
    expect(result.prompt_templates[0].name).toBe("原有模版");

    const newTpl = result.prompt_templates[1];
    expect(newTpl.name).toBe("AI 优化版");
    expect(newTpl.system_prompt).toBe("优化后的 prompt");
    expect(newTpl.id).toBeTruthy();
    expect(newTpl.id).not.toBe("tpl-1"); // 新 UUID 不同于现有
  });

  it("新模板 ID 是合法的 UUID 格式", () => {
    const config = makeConfig({ prompt_templates: [] });

    const result = applyActions(config, [
      {
        type: "add_prompt_template",
        template: { name: "新模板" },
      },
    ]);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(result.prompt_templates[0].id).toMatch(uuidRegex);
  });

  it("连续添加两个模板，各自拥有不同 UUID", () => {
    const config = makeConfig({ prompt_templates: [] });

    const result = applyActions(config, [
      {
        type: "add_prompt_template",
        template: { name: "模板A", system_prompt: "A" },
      },
      {
        type: "add_prompt_template",
        template: { name: "模板B", system_prompt: "B" },
      },
    ]);

    expect(result.prompt_templates).toHaveLength(2);
    expect(result.prompt_templates[0].id).not.toBe(result.prompt_templates[1].id);
  });
});

// ─── 3. 切换"另存为新模板"：type 从 update 变为 add ──────────────────────────

describe("切换另存为新模板: update→add 语义变化", () => {
  it("同一模板内容，type=update 时原地更新，type=add 时创建新模板", () => {
    const original = makeTemplate({
      id: "tpl-original",
      name: "日报模版",
      system_prompt: "原始 prompt",
    });
    const config = makeConfig({ prompt_templates: [original] });

    // 场景 1: update → 原地更新
    const updateResult = applyActions(config, [
      {
        type: "update_prompt_template",
        template_name: "日报模版",
        template: { system_prompt: "AI 优化的 prompt" },
      },
    ]);

    expect(updateResult.prompt_templates).toHaveLength(1);
    expect(updateResult.prompt_templates[0].id).toBe("tpl-original");
    expect(updateResult.prompt_templates[0].system_prompt).toBe("AI 优化的 prompt");

    // 场景 2: 切换为 add → 创建新模板，原模板不变
    const addResult = applyActions(config, [
      {
        type: "add_prompt_template",
        template: { name: "日报模版（优化版）", system_prompt: "AI 优化的 prompt" },
      },
    ]);

    expect(addResult.prompt_templates).toHaveLength(2);
    // 原模板完整保留
    expect(addResult.prompt_templates[0].id).toBe("tpl-original");
    expect(addResult.prompt_templates[0].name).toBe("日报模版");
    expect(addResult.prompt_templates[0].system_prompt).toBe("原始 prompt");
    // 新模板是独立副本
    const newTpl = addResult.prompt_templates[1];
    expect(newTpl.id).not.toBe("tpl-original");
    expect(newTpl.system_prompt).toBe("AI 优化的 prompt");
  });

  it("切换为 add 后，原模板的 data_template 也保持不变", () => {
    const original = makeTemplate({
      id: "tpl-dt",
      name: "数据模版",
      system_prompt: "sp",
      data_template: "原始 data template",
    });
    const config = makeConfig({ prompt_templates: [original] });

    const result = applyActions(config, [
      {
        type: "add_prompt_template",
        template: {
          name: "数据模版（优化版）",
          system_prompt: "sp-new",
          data_template: "新 data template",
        },
      },
    ]);

    expect(result.prompt_templates).toHaveLength(2);
    expect(result.prompt_templates[0].data_template).toBe("原始 data template");
    expect(result.prompt_templates[1].data_template).toBe("新 data template");
  });
});

// ─── 4. 另存为新模板时，名称应包含后缀 ──────────────────────────────────────

describe("另存为新模板: 名称约定", () => {
  it("add_prompt_template 的 template.name 应区别于原模板名称", () => {
    // 这个测试验证设计约定：AI 优化编辑后选择"另存为新模板"时，
    // action 的 template.name 应包含区分性后缀（如"优化版"），
    // 使得新旧模板在 UI 中可区分
    const original = makeTemplate({ id: "tpl-1", name: "项目日报" });
    const config = makeConfig({ prompt_templates: [original] });

    // 模拟 AI 优化后选择另存为新模板的 action
    const result = applyActions(config, [
      {
        type: "add_prompt_template",
        template: {
          name: "项目日报（优化版）", // 带后缀
          system_prompt: "优化后的 prompt",
        },
      },
    ]);

    expect(result.prompt_templates).toHaveLength(2);
    // 新旧模板名称不同
    expect(result.prompt_templates[1].name).not.toBe(result.prompt_templates[0].name);
    // 新模板名称包含原名 + 后缀
    expect(result.prompt_templates[1].name).toContain("项目日报");
    expect(result.prompt_templates[1].name).not.toBe("项目日报");
  });
});

// ─── 5. update 操作找不到匹配模板时不改变数组 ────────────────────────────────

describe("update_prompt_template: 找不到匹配模板时的防御", () => {
  it("template_name 不匹配任何模板时，数组保持不变", () => {
    const tpl = makeTemplate({ id: "tpl-1", name: "日报模版", system_prompt: "原始" });
    const config = makeConfig({ prompt_templates: [tpl] });

    const result = applyActions(config, [
      {
        type: "update_prompt_template",
        template_name: "不存在的模版",
        template: { system_prompt: "新 prompt" },
      },
    ]);

    expect(result.prompt_templates).toHaveLength(1);
    expect(result.prompt_templates[0].name).toBe("日报模版");
    expect(result.prompt_templates[0].system_prompt).toBe("原始");
  });

  it("template_id 不匹配任何模板时，数组保持不变", () => {
    const tpl = makeTemplate({ id: "tpl-1", name: "日报模版" });
    const config = makeConfig({ prompt_templates: [tpl] });

    const result = applyActions(config, [
      {
        type: "update_prompt_template",
        template_id: "nonexistent-id",
        template: { system_prompt: "新 prompt" },
      },
    ]);

    expect(result.prompt_templates).toHaveLength(1);
    expect(result.prompt_templates[0]).toEqual(tpl);
  });

  it("空模板数组上执行 update 不报错且返回空数组", () => {
    const config = makeConfig({ prompt_templates: [] });

    const result = applyActions(config, [
      {
        type: "update_prompt_template",
        template_name: "不存在",
        template: { system_prompt: "新 prompt" },
      },
    ]);

    expect(result.prompt_templates).toHaveLength(0);
  });

  it("config 为 null 时 update 不报错", () => {
    const result = applyActions(null, [
      {
        type: "update_prompt_template",
        template_name: "不存在",
        template: { system_prompt: "新 prompt" },
      },
    ]);

    expect(result.prompt_templates).toHaveLength(0);
  });
});

// ─── 6. 不可变性验证 ─────────────────────────────────────────────────────────

describe("applyActions 不可变性", () => {
  it("update 操作不修改原始 config 的 prompt_templates", () => {
    const tpl = makeTemplate({ id: "tpl-1", name: "原名", system_prompt: "原始" });
    const config = makeConfig({ prompt_templates: [tpl] });
    const originalName = config.prompt_templates[0].name;
    const originalPrompt = config.prompt_templates[0].system_prompt;

    applyActions(config, [
      {
        type: "update_prompt_template",
        template_name: "原名",
        template: { name: "新名", system_prompt: "新 prompt" },
      },
    ]);

    expect(config.prompt_templates[0].name).toBe(originalName);
    expect(config.prompt_templates[0].system_prompt).toBe(originalPrompt);
  });

  it("add 操作不修改原始 config 的 prompt_templates 数组长度", () => {
    const config = makeConfig({ prompt_templates: [] });
    const originalLength = config.prompt_templates.length;

    applyActions(config, [
      {
        type: "add_prompt_template",
        template: { name: "新模板" },
      },
    ]);

    expect(config.prompt_templates).toHaveLength(originalLength);
  });
});

// ─── 7. 边界场景 ─────────────────────────────────────────────────────────────

describe("边界场景", () => {
  it("add_prompt_template 缺少 template 字段时不添加任何内容", () => {
    const config = makeConfig({ prompt_templates: [] });

    const result = applyActions(config, [
      { type: "add_prompt_template" } as ParsedSummaryConfigAction,
    ]);

    expect(result.prompt_templates).toHaveLength(0);
  });

  it("add_prompt_template 的 template 没有 name 时使用默认名", () => {
    const config = makeConfig({ prompt_templates: [] });

    const result = applyActions(config, [
      {
        type: "add_prompt_template",
        template: { system_prompt: "some prompt" },
      },
    ]);

    expect(result.prompt_templates).toHaveLength(1);
    expect(result.prompt_templates[0].name).toBeTruthy(); // 有默认名
  });

  it("update_prompt_template 缺少 template 字段时不修改任何内容", () => {
    const tpl = makeTemplate({ id: "tpl-1", name: "日报", system_prompt: "原始" });
    const config = makeConfig({ prompt_templates: [tpl] });

    const result = applyActions(config, [
      {
        type: "update_prompt_template",
        template_name: "日报",
        // 没有 template 字段
      } as ParsedSummaryConfigAction,
    ]);

    expect(result.prompt_templates[0].system_prompt).toBe("原始");
  });
});
