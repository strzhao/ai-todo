function extractJsonPayload(raw: string): string {
  let text = String(raw || "").trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  return text;
}

export class LLMError extends Error {}

export class LLMClient {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;

  constructor(options: { apiKey?: string; model?: string; baseUrl?: string; timeoutSeconds?: number } = {}) {
    this.apiKey = options.apiKey || process.env.DEEPSEEK_API_KEY || "";
    this.model = options.model || process.env.DEEPSEEK_MODEL || "deepseek-chat";
    this.baseUrl = (options.baseUrl || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
    this.timeoutMs = Math.max(1_000, Math.trunc((options.timeoutSeconds ?? 55) * 1_000));

    if (!this.apiKey) {
      throw new LLMError("Missing DEEPSEEK_API_KEY");
    }
  }

  async chat(messages: Array<{ role: string; content: string }>, temperature = 0.2): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;
    const payload = { model: this.model, messages, temperature };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        throw new LLMError(`LLM request failed: ${response.status} ${text}`);
      }

      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new LLMError(`Unexpected LLM response: ${text}`);
      }

      const content = (data as { choices?: Array<{ message?: { content?: string } }> })
        ?.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new LLMError(`Unexpected LLM response: ${text}`);
      }
      return content;
    } catch (err) {
      if (err instanceof LLMError) {
        throw err;
      }
      if ((err as { name?: string }).name === "AbortError") {
        throw new LLMError(`LLM request timeout after ${this.timeoutMs}ms`);
      }
      throw new LLMError(`LLM request failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async chatStream(
    messages: Array<{ role: string; content: string }>,
    temperature = 0.2
  ): Promise<ReadableStream<string>> {
    const url = `${this.baseUrl}/chat/completions`;
    const payload = { model: this.model, messages, temperature, stream: true };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if ((err as { name?: string }).name === "AbortError") {
        throw new LLMError(`LLM request timeout after ${this.timeoutMs}ms`);
      }
      throw new LLMError(`LLM request failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!response.ok || !response.body) {
      clearTimeout(timer);
      const text = await response.text().catch(() => "");
      throw new LLMError(`LLM stream failed: ${response.status} ${text}`);
    }

    let buffer = "";
    const decoder = new TextDecoder();
    const reader = response.body.getReader();

    return new ReadableStream<string>({
      async pull(ctrl) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            clearTimeout(timer);
            ctrl.close();
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") {
              clearTimeout(timer);
              ctrl.close();
              return;
            }
            try {
              const json = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
              const content = json.choices?.[0]?.delta?.content;
              if (content) ctrl.enqueue(content);
            } catch { /* skip malformed chunks */ }
          }
        } catch (err) {
          clearTimeout(timer);
          ctrl.error(err);
        }
      },
      cancel() {
        clearTimeout(timer);
        reader.cancel();
      },
    });
  }

  async chatJson(messages: Array<{ role: string; content: string }>, temperature = 0.2): Promise<Record<string, unknown>> {
    const raw = await this.chat(messages, temperature);
    const cleaned = extractJsonPayload(raw);
    try {
      return JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      throw new LLMError(`Model output is not valid JSON: ${raw}`);
    }
  }
}
