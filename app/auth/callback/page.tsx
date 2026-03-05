"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ERROR_MESSAGES: Record<string, string> = {
  state_mismatch: "登录状态校验失败，请重新发起登录。",
  authorization_not_completed: "授权未完成，请重新登录。",
  unauthorized: "登录状态已失效，请重新登录。",
};

type ExchangePayload = {
  accessToken?: unknown;
  access_token?: unknown;
  refreshToken?: unknown;
  refresh_token?: unknown;
  expiresIn?: unknown;
  expires_in?: unknown;
  error?: unknown;
  upstreamError?: unknown;
  upstreamMessage?: unknown;
};

type ExchangeErrorInfo = {
  message: string;
  forceRelogin: boolean;
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
  document.cookie = `${name}=; Max-Age=0; Path=/; Secure; SameSite=Lax`;
  document.cookie = `${name}=; Max-Age=0; Path=/auth/callback; Secure; SameSite=Lax`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function buildReloginPath(nextPath: string): string {
  return `/api/auth/relogin?next=${encodeURIComponent(nextPath)}`;
}

function getExchangeErrorInfo(payload: ExchangePayload | null): ExchangeErrorInfo {
  const upstreamError = readString(payload?.upstreamError);
  if (upstreamError === "missing_refresh_token") {
    return {
      message: "认证服务未返回 refresh_token，请重新登录以刷新统一登录会话。",
      forceRelogin: true,
    };
  }
  if (upstreamError === "invalid_refresh_token") {
    return {
      message: "登录状态已失效，请重新发起登录。",
      forceRelogin: true,
    };
  }

  const relayError = readString(payload?.error);
  if (relayError === "network_error") {
    return {
      message: "认证服务暂时不可用，请稍后重试。",
      forceRelogin: false,
    };
  }

  const upstreamMessage = readString(payload?.upstreamMessage);
  if (upstreamMessage) {
    return {
      message: `获取登录凭证失败：${upstreamMessage}`,
      forceRelogin: false,
    };
  }

  return {
    message: "获取登录凭证失败，请重新登录。",
    forceRelogin: false,
  };
}

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);
  const [reloginPath, setReloginPath] = useState("/");

  useEffect(() => {
    let cancelled = false;

    async function finalizeAuth() {
      const callbackUrl = new URL(window.location.href);
      const callbackError = callbackUrl.searchParams.get("error");
      const authorized = callbackUrl.searchParams.get("authorized");
      const nextFromUrl = callbackUrl.searchParams.get("next");
      const nextFromCookie = readCookie("auth_next");
      const nextPath = normalizeNextPath(
        nextFromUrl ?? (nextFromCookie ? safeDecode(nextFromCookie) : null)
      );

      if (callbackError) {
        clearCookie("auth_next");
        if (!cancelled) {
          setReloginPath(buildReloginPath(nextPath));
          setError(ERROR_MESSAGES[callbackError] ?? "登录流程异常，请重试。");
        }
        return;
      }

      if (authorized !== "1") {
        clearCookie("auth_next");
        if (!cancelled) {
          setReloginPath(buildReloginPath(nextPath));
          setError("授权未完成，请重新登录。");
        }
        return;
      }

      // 通过服务端中转接口获取 token，避免浏览器直接跨域请求认证服务器（CORS 限制）。
      // 服务端会将请求 cookies 转发给认证服务器（生产环境下包含 .stringzhao.life 共享域 refresh_token）。
      let accessToken: string | undefined;
      let refreshToken: string | undefined;
      let expiresIn: number | undefined;
      let exchangeErrorMessage: string | null = null;
      let forceRelogin = false;

      try {
        const refreshRes = await fetch("/api/auth/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = (await refreshRes.json().catch(() => ({}))) as ExchangePayload;
        if (!refreshRes.ok) {
          const exchangeError = getExchangeErrorInfo(data);
          exchangeErrorMessage = exchangeError.message;
          forceRelogin = exchangeError.forceRelogin;
        } else {
          accessToken = readString(data.accessToken) ?? readString(data.access_token);
          refreshToken = readString(data.refreshToken) ?? readString(data.refresh_token);
          expiresIn = readNumber(data.expiresIn) ?? readNumber(data.expires_in);
        }
      } catch {
        exchangeErrorMessage = "认证服务暂时不可用，请稍后重试。";
      }

      if (accessToken) {
        // Write tokens to our domain so the proxy can verify them.
        // refreshToken is optional now: refresh flow relies on shared-domain cookie.
        const sessionRes = await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken, refreshToken, expiresIn }),
        }).catch(() => null);

        if ((!sessionRes || !sessionRes.ok) && !cancelled) {
          clearCookie("auth_next");
          setReloginPath(buildReloginPath(nextPath));
          setError("写入登录会话失败，请重新登录。");
          return;
        }
      } else if (!cancelled) {
        clearCookie("auth_next");
        setReloginPath(forceRelogin ? buildReloginPath(nextPath) : "/");
        setError(exchangeErrorMessage ?? "获取登录凭证失败，请重新登录。");
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
            <form action={reloginPath} method="get">
              <Button className="w-full" type="submit">重新登录</Button>
            </form>
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
