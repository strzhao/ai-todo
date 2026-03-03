"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const callbackUrl = new URL(window.location.href);
    const callbackError = callbackUrl.searchParams.get("error");
    const authorized = callbackUrl.searchParams.get("authorized");
    const nextPath = normalizeNextPath(callbackUrl.searchParams.get("next"));

    if (callbackError) {
      setError(ERROR_MESSAGES[callbackError] ?? "登录流程异常，请重试。");
      return;
    }

    if (authorized !== "1") {
      setError("授权未完成，请重新登录。");
      return;
    }

    router.replace(nextPath);
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
