"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Status = "authorizing" | "success" | "error";

export default function CLIAuthPage() {
  const [status, setStatus] = useState<Status>("authorizing");
  const [message, setMessage] = useState("正在授权 CLI...");

  useEffect(() => {
    let cancelled = false;

    async function authorize() {
      const params = new URLSearchParams(window.location.search);
      const port = params.get("port");
      const state = params.get("state");

      if (!port || !state) {
        if (!cancelled) {
          setStatus("error");
          setMessage("缺少必要参数 (port, state)，请通过 CLI 发起登录。");
        }
        return;
      }

      try {
        const tokenRes = await fetch("/api/auth/cli-token", { method: "POST" });
        if (!tokenRes.ok) {
          if (!cancelled) {
            setStatus("error");
            setMessage("获取凭证失败，请重新登录后再试。");
          }
          return;
        }

        const { access_token, user_id, email } = await tokenRes.json();

        const callbackRes = await fetch(`http://localhost:${port}/callback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token, user_id, email, state }),
        });

        if (!callbackRes.ok) {
          if (!cancelled) {
            setStatus("error");
            setMessage("无法将凭证发送给 CLI，请确认 CLI 仍在运行。");
          }
          return;
        }

        if (!cancelled) {
          setStatus("success");
          setMessage(`授权成功 (${email})，可以关闭此页面。`);
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("授权过程出错，请确认 CLI 仍在运行后重试。");
        }
      }
    }

    void authorize();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">AI Todo CLI</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          {status === "authorizing" && (
            <p className="text-sm text-muted-foreground">请稍候...</p>
          )}
          {status === "success" && (
            <p className="text-sm text-green-600">已完成，可安全关闭此窗口。</p>
          )}
          {status === "error" && (
            <p className="text-sm text-destructive">请在终端运行 `ai-todo login` 重试。</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
