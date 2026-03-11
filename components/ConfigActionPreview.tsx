"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ParsedSummaryConfigAction, SummaryConfig, SummaryDataSource } from "@/lib/types";

interface Props {
  actions: ParsedSummaryConfigAction[];
  currentConfig: SummaryConfig | null;
  defaults: { system_prompt: string; data_template: string };
  spaceId: string;
  onDone: (updatedConfig: SummaryConfig) => void;
  onCancel: () => void;
}

function ActionRow({ action }: { action: ParsedSummaryConfigAction }) {
  const [expanded, setExpanded] = useState(false);

  if (action.type === "update_prompt") {
    const isReset = action.new_prompt === null || action.new_prompt === undefined;
    return (
      <div className="text-sm space-y-1">
        <div className="flex items-start gap-2">
          <span className="text-sage flex-shrink-0">✎</span>
          <div className="flex-1">
            <span>
              {isReset ? "恢复系统 Prompt 为默认" : `修改系统 Prompt：${action.prompt_changes_description ?? "已更新"}`}
            </span>
            {!isReset && action.new_prompt && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-info ml-2 hover:underline"
              >
                {expanded ? "收起" : "查看完整内容"}
              </button>
            )}
          </div>
        </div>
        {expanded && action.new_prompt && (
          <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-60 whitespace-pre-wrap text-muted-foreground">
            {action.new_prompt}
          </pre>
        )}
      </div>
    );
  }

  if (action.type === "update_template") {
    const isReset = action.new_template === null || action.new_template === undefined;
    return (
      <div className="text-sm space-y-1">
        <div className="flex items-start gap-2">
          <span className="text-sage flex-shrink-0">✎</span>
          <div className="flex-1">
            <span>
              {isReset ? "恢复数据模板为默认" : `修改数据模板：${action.template_changes_description ?? "已更新"}`}
            </span>
            {!isReset && action.new_template && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-info ml-2 hover:underline"
              >
                {expanded ? "收起" : "查看完整内容"}
              </button>
            )}
          </div>
        </div>
        {expanded && action.new_template && (
          <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-60 whitespace-pre-wrap text-muted-foreground">
            {action.new_template}
          </pre>
        )}
      </div>
    );
  }

  if (action.type === "add_datasource" && action.datasource) {
    const ds = action.datasource;
    return (
      <div className="flex items-start gap-2 text-sm">
        <span className="text-sage flex-shrink-0">＋</span>
        <span>
          添加数据源「<span className="font-medium">{ds.name ?? "未命名"}</span>」
          <span className="text-muted-foreground ml-1">
            {ds.method ?? "GET"} {ds.url ? (ds.url.length > 50 ? ds.url.slice(0, 50) + "..." : ds.url) : ""}
          </span>
        </span>
      </div>
    );
  }

  if (action.type === "update_datasource") {
    return (
      <div className="flex items-start gap-2 text-sm">
        <span className="text-info flex-shrink-0">↻</span>
        <span>
          更新数据源「<span className="font-medium">{action.datasource_name ?? "未知"}</span>」
        </span>
      </div>
    );
  }

  if (action.type === "remove_datasource") {
    return (
      <div className="flex items-start gap-2 text-sm">
        <span className="text-destructive flex-shrink-0">×</span>
        <span>
          删除数据源「<span className="font-medium">{action.datasource_name ?? "未知"}</span>」
        </span>
      </div>
    );
  }

  if (action.type === "toggle_datasource") {
    return (
      <div className="flex items-start gap-2 text-sm">
        <span className="text-info flex-shrink-0">⇄</span>
        <span>
          {action.enabled ? "启用" : "禁用"}数据源「<span className="font-medium">{action.datasource_name ?? "未知"}</span>」
        </span>
      </div>
    );
  }

  return null;
}

function applyActions(
  config: SummaryConfig | null,
  defaults: { system_prompt: string; data_template: string },
  actions: ParsedSummaryConfigAction[],
  spaceId: string
): { system_prompt: string | null; data_template: string | null; data_sources: SummaryDataSource[] } {
  let systemPrompt = config?.system_prompt ?? null;
  let dataTemplate = config?.data_template ?? null;
  let dataSources = [...(config?.data_sources ?? [])];

  for (const action of actions) {
    switch (action.type) {
      case "update_prompt":
        systemPrompt = action.new_prompt === null || action.new_prompt === undefined
          ? null
          : action.new_prompt;
        break;

      case "update_template":
        dataTemplate = action.new_template === null || action.new_template === undefined
          ? null
          : action.new_template;
        break;

      case "add_datasource":
        if (action.datasource) {
          // 去重：如果已存在相同 URL 的数据源，更新而非重复添加
          const existingIdx = dataSources.findIndex(
            (s) => s.url === action.datasource!.url
          );
          const newDs: SummaryDataSource = {
            id: crypto.randomUUID(),
            name: action.datasource.name ?? "未命名数据源",
            enabled: action.datasource.enabled ?? true,
            method: action.datasource.method ?? "GET",
            url: action.datasource.url ?? "",
            headers: action.datasource.headers,
            body_template: action.datasource.body_template,
            response_extract: action.datasource.response_extract,
            inject_as: action.datasource.inject_as ?? "data",
            timeout_ms: action.datasource.timeout_ms,
          };
          if (existingIdx >= 0) {
            dataSources[existingIdx] = { ...dataSources[existingIdx], ...newDs, id: dataSources[existingIdx].id };
          } else {
            dataSources.push(newDs);
          }
        }
        break;

      case "update_datasource": {
        const idx = dataSources.findIndex(
          (s) => s.name === action.datasource_name || s.id === action.datasource_id
        );
        if (idx >= 0 && action.datasource) {
          dataSources[idx] = { ...dataSources[idx], ...action.datasource };
        }
        break;
      }

      case "remove_datasource": {
        dataSources = dataSources.filter(
          (s) => s.name !== action.datasource_name && s.id !== action.datasource_id
        );
        break;
      }

      case "toggle_datasource": {
        const tidx = dataSources.findIndex(
          (s) => s.name === action.datasource_name || s.id === action.datasource_id
        );
        if (tidx >= 0 && action.enabled !== undefined) {
          dataSources[tidx] = { ...dataSources[tidx], enabled: action.enabled };
        }
        break;
      }
    }
  }

  return { system_prompt: systemPrompt, data_template: dataTemplate, data_sources: dataSources };
}

export function ConfigActionPreview({ actions, currentConfig, defaults, spaceId, onDone, onCancel }: Props) {
  const [executing, setExecuting] = useState(false);

  async function handleConfirm() {
    setExecuting(true);
    try {
      const merged = applyActions(currentConfig, defaults, actions, spaceId);
      const res = await fetch(`/api/spaces/${spaceId}/summary-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
      });

      if (res.ok) {
        const data = await res.json() as { config: SummaryConfig };
        onDone(data.config);
      }
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          AI 理解：{actions.length} 项配置变更
        </p>
      </div>

      <div className="space-y-2 py-1">
        {actions.map((action, i) => (
          <ActionRow key={i} action={action} />
        ))}
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={executing}>
          取消
        </Button>
        <Button size="sm" onClick={handleConfirm} disabled={executing}>
          {executing ? "应用中..." : `应用变更 (${actions.length})`}
        </Button>
      </div>
    </div>
  );
}
