"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function normalizeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

async function parseJsonObject(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload = (await response.json()) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
    return payload as Record<string, unknown>;
  } catch {
    return {};
  }
}

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function finalizeAuth() {
      const url = new URL(window.location.href);
      const callbackError = url.searchParams.get("error");

      if (callbackError) {
        if (!cancelled) {
          const messages: Record<string, string> = {
            state_mismatch: "登录状态校验失败，请重新发起登录。",
            authorization_not_completed: "授权未完成，请重新登录。",
          };
          setError(messages[callbackError] ?? "登录流程异常，请重试。");
        }
        return;
      }

      const authorized = url.searchParams.get("authorized");
      const state = url.searchParams.get("state");

      if (authorized !== "1" || !state) {
        if (!cancelled) setError("授权未完成，请重新登录。");
        return;
      }

      try {
        const response = await fetch("/api/auth/session/finalize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({ state }),
        });
        const payload = await parseJsonObject(response);

        if (!response.ok) {
          const reason = String(payload.error || payload.message || "finalize_failed");
          throw new Error(reason);
        }

        const nextPath = normalizeNextPath(String(payload.next || "/"));
        if (!cancelled) {
          window.location.href = nextPath;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "授权回跳处理失败");
        }
      }
    }

    void finalizeAuth();
    return () => { cancelled = true; };
  }, [retryNonce]);

  function retryFinalize() {
    setError(null);
    setRetryNonce((n) => n + 1);
  }

  function restartAuthorize() {
    window.location.href = "/";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">AI Todo</CardTitle>
          <CardDescription>
            {error ?? "正在完成登录，请稍候..."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={retryFinalize}>
                重试
              </Button>
              <Button className="flex-1" variant="outline" onClick={restartAuthorize}>
                重新授权
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center">
              将自动返回应用页面
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
