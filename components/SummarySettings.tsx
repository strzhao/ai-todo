"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { ConfigActionPreview } from "@/components/ConfigActionPreview";
import type { SummaryConfig, SummaryDataSource, ParsedSummaryConfigAction } from "@/lib/types";

interface Props {
  spaceId: string;
  spaceName: string;
}

export function SummarySettings({ spaceId, spaceName }: Props) {
  const [config, setConfig] = useState<SummaryConfig | null>(null);
  const [defaults, setDefaults] = useState<{ system_prompt: string; data_template: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedSummaryConfigAction[] | null>(null);
  const [promptExpanded, setPromptExpanded] = useState(true);
  const [templateExpanded, setTemplateExpanded] = useState(false);
  const [resetting, setResetting] = useState<"prompt" | "template" | null>(null);

  // Summary preview state
  const [summaryContent, setSummaryContent] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch(`/api/spaces/${spaceId}/summary-config`)
      .then((r) => r.json())
      .then((data) => {
        setConfig(data.config);
        setDefaults(data.defaults);
      })
      .finally(() => setLoading(false));
  }, [spaceId]);

  async function handleParse() {
    if (!inputText.trim() || parsing) return;
    setParsing(true);
    setParseError(null);
    setPreview(null);

    try {
      const res = await fetch(`/api/spaces/${spaceId}/summary-config/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "解析失败" }));
        setParseError(data.error || "解析失败");
        return;
      }

      const data = await res.json() as { actions: ParsedSummaryConfigAction[] };
      if (data.actions.length === 0) {
        setParseError("未识别到有效的配置变更");
        return;
      }
      setPreview(data.actions);
    } catch {
      setParseError("网络错误，请重试");
    } finally {
      setParsing(false);
    }
  }

  function handlePreviewDone(updatedConfig: SummaryConfig) {
    setConfig(updatedConfig);
    setPreview(null);
    setInputText("");
  }

  async function handleResetField(field: "prompt" | "template") {
    setResetting(field);
    try {
      const body = field === "prompt"
        ? { system_prompt: null }
        : { data_template: null };

      const res = await fetch(`/api/spaces/${spaceId}/summary-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json() as { config: SummaryConfig | null };
        setConfig(data.config);
      }
    } finally {
      setResetting(null);
    }
  }

  const triggerSummary = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSummaryLoading(true);
    setSummaryError(null);
    setSummaryContent("");

    try {
      const res = await fetch(`/api/tasks/${spaceId}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: new Date().toISOString().slice(0, 10) }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "生成失败" }));
        throw new Error(data.error || `请求失败 (${res.status})`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setSummaryContent(full);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setSummaryError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setSummaryLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <div className="w-3 h-3 border border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
        加载配置中...
      </div>
    );
  }

  const currentPrompt = config?.system_prompt ?? defaults?.system_prompt ?? "";
  const currentTemplate = config?.data_template ?? defaults?.data_template ?? "";
  const isCustomPrompt = !!config?.system_prompt;
  const isCustomTemplate = !!config?.data_template;
  const dataSources = config?.data_sources ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ── Left: Config Display ── */}
      <div className="space-y-4 min-w-0">
        {/* System Prompt */}
        <section className="rounded-lg border border-border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium">系统 Prompt</h3>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${isCustomPrompt ? "bg-sage-mist text-sage" : "bg-muted text-muted-foreground"}`}>
                {isCustomPrompt ? "已自定义" : "默认"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isCustomPrompt && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handleResetField("prompt")}
                  disabled={resetting === "prompt"}
                >
                  {resetting === "prompt" ? "恢复中..." : "恢复默认"}
                </Button>
              )}
              <button
                onClick={() => setPromptExpanded(!promptExpanded)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {promptExpanded ? "收起" : "展开"}
              </button>
            </div>
          </div>
          {promptExpanded && (
            <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-80 whitespace-pre-wrap text-muted-foreground">
              {currentPrompt}
            </pre>
          )}
        </section>

        {/* Data Template */}
        <section className="rounded-lg border border-border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium">数据模板</h3>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${isCustomTemplate ? "bg-sage-mist text-sage" : "bg-muted text-muted-foreground"}`}>
                {isCustomTemplate ? "已自定义" : "默认"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isCustomTemplate && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => handleResetField("template")}
                  disabled={resetting === "template"}
                >
                  {resetting === "template" ? "恢复中..." : "恢复默认"}
                </Button>
              )}
              <button
                onClick={() => setTemplateExpanded(!templateExpanded)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {templateExpanded ? "收起" : "展开"}
              </button>
            </div>
          </div>
          {templateExpanded && (
            <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-80 whitespace-pre-wrap text-muted-foreground">
              {currentTemplate}
            </pre>
          )}
          {templateExpanded && (
            <p className="text-[10px] text-muted-foreground">
              可用变量：{"{{date}}"} {"{{project_name}}"} {"{{task_tree}}"} {"{{all_logs}}"} {"{{today_logs}}"} {"{{stats}}"} {"{{ds.变量名}}"}
            </p>
          )}
        </section>

        {/* Data Sources */}
        <section className="rounded-lg border border-border p-4 space-y-2">
          <h3 className="text-sm font-medium">外部数据源</h3>
          {dataSources.length === 0 ? (
            <p className="text-xs text-muted-foreground">暂未配置外部数据源</p>
          ) : (
            <div className="space-y-2">
              {dataSources.map((ds) => (
                <DataSourceRow key={ds.id} source={ds} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Right: AI Assistant + Summary Preview ── */}
      <div className="space-y-4 min-w-0">
        {/* AI Config Assistant */}
        <section className="rounded-lg border border-sage/30 bg-sage-mist/30 p-4 space-y-3">
          <h3 className="text-sm font-medium">AI 配置助手</h3>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleParse();
              }
            }}
            placeholder={"描述你想要的变更...\n例：只保留问题与解决和风险提示\n例：添加一个 GitLab API 数据源，GET https://..."}
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-sage"
            rows={5}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">⌘+Enter 发送</span>
            <Button
              size="sm"
              onClick={handleParse}
              disabled={parsing || !inputText.trim()}
            >
              {parsing ? "解析中..." : "发送"}
            </Button>
          </div>

          {parseError && (
            <p className="text-xs text-destructive">{parseError}</p>
          )}

          {preview && defaults && (
            <ConfigActionPreview
              actions={preview}
              currentConfig={config}
              defaults={defaults}
              spaceId={spaceId}
              onDone={handlePreviewDone}
              onCancel={() => setPreview(null)}
            />
          )}
        </section>

        {/* Summary Preview */}
        <section className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">总结预览</h3>
            <button
              onClick={triggerSummary}
              disabled={summaryLoading}
              className="text-xs px-3 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {summaryLoading ? "生成中..." : summaryContent ? "重新生成" : "生成总结"}
            </button>
          </div>

          {summaryError && (
            <p className="text-xs text-destructive">{summaryError}</p>
          )}

          {summaryLoading && !summaryContent && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
              <div className="w-3 h-3 border border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
              正在使用当前配置生成总结...
            </div>
          )}

          {summaryContent ? (
            <div className="prose-summary text-sm text-foreground/80 max-h-[500px] overflow-auto">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryContent}</ReactMarkdown>
            </div>
          ) : (
            !summaryLoading && !summaryError && (
              <p className="text-xs text-muted-foreground py-3">
                点击「生成总结」使用当前配置预览效果
              </p>
            )
          )}
        </section>
      </div>
    </div>
  );
}

function DataSourceRow({ source }: { source: SummaryDataSource }) {
  const hasHeaders = source.headers && Object.keys(source.headers).length > 0;
  const hasBody = !!source.body_template;
  const hasExtract = !!source.response_extract;

  return (
    <div className="py-2 space-y-1.5">
      <div className="flex items-center gap-3">
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${source.enabled ? "bg-sage" : "bg-muted-foreground/30"}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate">{source.name}</p>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${source.enabled ? "bg-sage-mist text-sage" : "bg-muted text-muted-foreground"}`}>
          {source.enabled ? "已启用" : "已禁用"}
        </span>
      </div>
      <div className="ml-[18px] space-y-1 text-xs text-muted-foreground">
        <p className="font-mono truncate">{source.method} {source.url}</p>
        {hasHeaders && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {Object.entries(source.headers!).map(([k, v]) => (
              <span key={k} className="font-mono">{k}: {v}</span>
            ))}
          </div>
        )}
        {hasBody && <p className="truncate">Body: <span className="font-mono">{source.body_template}</span></p>}
        {hasExtract && <p>提取路径: <span className="font-mono">{source.response_extract}</span></p>}
        <p>注入变量: <span className="font-mono">{"{{ds." + source.inject_as + "}}"}</span></p>
      </div>
    </div>
  );
}
