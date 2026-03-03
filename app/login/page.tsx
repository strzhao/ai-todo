"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendCode() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error || "发送失败，请重试");
        return;
      }
      setStep("code");
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error || "验证码错误，请重试");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">AI Todo</CardTitle>
          <CardDescription>
            {step === "email" ? "输入邮箱登录" : `验证码已发送至 ${email}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "email" ? (
            <>
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && email && sendCode()}
                autoFocus
              />
              <Button
                className="w-full"
                onClick={sendCode}
                disabled={!email || loading}
              >
                {loading ? "发送中..." : "发送验证码"}
              </Button>
            </>
          ) : (
            <>
              <Input
                type="text"
                placeholder="请输入验证码"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && code && verifyCode()}
                autoFocus
                maxLength={6}
              />
              <Button
                className="w-full"
                onClick={verifyCode}
                disabled={!code || loading}
              >
                {loading ? "验证中..." : "登录"}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => { setStep("email"); setCode(""); setError(""); }}
              >
                重新输入邮箱
              </Button>
            </>
          )}
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
