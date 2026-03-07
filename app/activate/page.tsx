"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function ActivatePage() {
  return (
    <Suspense>
      <ActivateForm />
    </Suspense>
  );
}

function ActivateForm() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const urlCode = searchParams.get("code");
    if (urlCode) setCode(urlCode);
  }, [searchParams]);

  async function handleActivate() {
    const trimmed = code.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/invitation/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg =
          data.error === "invalid_invitation_code" ? "邀请码无效或已被使用" :
          data.error === "self_redeem_not_allowed" ? "不能使用自己生成的邀请码" :
          data.error === "invitation_code_already_redeemed" ? "邀请码已被使用" :
          data.error || "激活失败，请重试";
        setError(msg);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">AI Todo</h1>
          <p className="text-sm text-muted-foreground mt-2">输入邀请码开始使用</p>
        </div>

        <div className="border border-border rounded-xl p-6 space-y-4">
          <input
            type="text"
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleActivate(); }}
            placeholder="请输入 8 位邀请码"
            maxLength={8}
            className="w-full px-4 py-3 text-center text-lg tracking-widest font-mono rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 uppercase"
            autoFocus
          />

          {error && (
            <p className="text-xs text-destructive text-center">{error}</p>
          )}

          <Button
            className="w-full"
            onClick={handleActivate}
            disabled={loading || code.trim().length === 0}
          >
            {loading ? "激活中..." : "激活"}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            没有邀请码？请联系已有用户获取
          </p>
        </div>
      </div>
    </div>
  );
}
