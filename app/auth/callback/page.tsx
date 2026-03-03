"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ERROR_MESSAGES: Record<string, string> = {
  state_mismatch: "登录状态校验失败，请重新发起登录。",
  authorization_not_completed: "授权未完成，请重新登录。",
};

function normalizeNextPath(rawPath: string | null): string {
  if (!rawPath || !rawPath.startsWith("/") || rawPath.startsWith("//")) {
    return "/";
  }
  return rawPath;
}

function readCookie(name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? match[1] : null;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; Path=/auth/callback; Secure; SameSite=Lax`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function finalizeAuth() {
      const callbackUrl = new URL(window.location.href);
      const callbackError = callbackUrl.searchParams.get("error");
      const authorized = callbackUrl.searchParams.get("authorized");
      const nextFromCookie = readCookie("auth_next");
      const nextPath = normalizeNextPath(
        nextFromCookie
          ? safeDecode(nextFromCookie)
          : callbackUrl.searchParams.get("next")
      );

      if (callbackError) {
        clearCookie("auth_next");
        if (!cancelled) {
          setError(ERROR_MESSAGES[callbackError] ?? "登录流程异常，请重试。");
        }
        return;
      }

      if (authorized !== "1") {
        clearCookie("auth_next");
        if (!cancelled) {
          setError("授权未完成，请重新登录。");
        }
        return;
      }

      // 通过服务端中转接口获取 token，避免浏览器直接跨域请求认证服务器（CORS 限制）。
      // 服务端会将请求 cookies 转发给认证服务器（生产环境下包含 .stringzhao.life 共享域 refresh_token）。
      let accessToken: string | undefined;
      let refreshToken: string | undefined;
      let expiresIn: number | undefined;

      try {
        const refreshRes = await fetch("/api/auth/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json().catch(() => ({}));
          accessToken = data.accessToken ?? data.access_token;
          refreshToken = data.refreshToken ?? data.refresh_token;
          expiresIn = data.expiresIn ?? data.expires_in;
        }
      } catch {
        // 网络异常
      }

      if (accessToken && refreshToken) {
        // Write tokens to our domain so the proxy can verify them.
        await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken, refreshToken, expiresIn }),
        }).catch(() => undefined);
      } else if (!cancelled) {
        setError("获取登录凭证失败，请重试。");
        return;
      }

      clearCookie("auth_next");
      // 使用完整页面跳转而非 router.replace()。
      // router.replace() 会触发 Next.js RSC fetch，proxy 会将其拦截并 307 重定向到认证服务器（跨域），导致 CORS 错误。
      window.location.href = nextPath;
    }

    void finalizeAuth();

    return () => {
      cancelled = true;
    };
  }, []);

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
            <Button className="w-full" asChild>
              <Link href="/">重新登录</Link>
            </Button>
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
