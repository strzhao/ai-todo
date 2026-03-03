"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ERROR_MESSAGES: Record<string, string> = {
  state_mismatch: "登录状态校验失败，请重新发起登录。",
  authorization_not_completed: "授权未完成，请重新登录。",
  session_sync_failed: "登录成功，但会话同步失败，请重试。",
};

const AUTH_ISSUER =
  process.env.NEXT_PUBLIC_AUTH_ISSUER ?? "https://user.stringzhao.life";

type RefreshPayload = {
  accessToken?: string;
  access_token?: string;
  refreshToken?: string;
  refresh_token?: string;
  expiresIn?: number;
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
  const router = useRouter();
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

      try {
        const refreshRes = await fetch(`${AUTH_ISSUER}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          credentials: "include",
        });

        if (!refreshRes.ok) {
          throw new Error("refresh_failed");
        }

        const refreshData = (await refreshRes.json()) as RefreshPayload;
        const accessToken =
          refreshData.accessToken ?? refreshData.access_token ?? "";
        const refreshToken =
          refreshData.refreshToken ?? refreshData.refresh_token ?? "";

        if (!accessToken || !refreshToken) {
          throw new Error("token_missing");
        }

        const syncRes = await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken,
            refreshToken,
            expiresIn: refreshData.expiresIn,
          }),
        });

        if (!syncRes.ok) {
          throw new Error("sync_failed");
        }

        clearCookie("auth_next");
        router.replace(nextPath);
      } catch {
        clearCookie("auth_next");
        if (!cancelled) {
          setError(ERROR_MESSAGES.session_sync_failed);
        }
      }
    }

    void finalizeAuth();

    return () => {
      cancelled = true;
    };
  }, [router]);

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
