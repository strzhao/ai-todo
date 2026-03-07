"use client";

import { useState, useEffect } from "react";

interface InvitationCode {
  id: string;
  code: string;
  status: "ACTIVE" | "REDEEMED" | "REVOKED";
  redeemedBy: string | null;
  redeemedAt: string | null;
  createdAt: string;
}

interface InviteData {
  codes: InvitationCode[];
  quota: { used: number; total: number };
}

interface Props {
  userEmail: string;
  isDev?: boolean;
}

export function AccountContent({ userEmail, isDev }: Props) {
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [inviteLoading, setInviteLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchCodes();
  }, []);

  async function fetchCodes() {
    try {
      const res = await fetch("/api/invitation/codes");
      setInviteData(await res.json());
    } catch {
      setInviteData({ codes: [], quota: { used: 0, total: 3 } });
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/invitation/codes/generate", { method: "POST" });
      if (res.ok) {
        await fetchCodes();
      }
    } finally {
      setGenerating(false);
    }
  }

  async function copyLink(code: string, codeId: string) {
    const link = `${window.location.origin}/activate?code=${code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "AI Todo 邀请", text: `使用邀请码 ${code} 加入 AI Todo`, url: link });
        return;
      } catch { /* fallback to clipboard */ }
    }
    await navigator.clipboard.writeText(link);
    setCopiedId(codeId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleSwitchAccount() {
    window.location.href = "/api/auth/switch-account";
  }

  const activeCodes = inviteData?.codes.filter((c) => c.status === "ACTIVE") ?? [];
  const usedCodes = inviteData?.codes.filter((c) => c.status === "REDEEMED") ?? [];
  const remaining = (inviteData?.quota.total ?? 3) - (inviteData?.quota.used ?? 0);

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
      <h1 className="text-lg font-semibold">账号设置</h1>

      {/* 账号信息 */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">账号信息</h2>
        <div className="flex items-center gap-2">
          <p className="text-sm">{userEmail}</p>
          {isDev && (
            <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
              DEV
            </span>
          )}
        </div>
      </section>

      {/* 邀请好友 */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">邀请好友</h2>
        {inviteLoading ? (
          <p className="text-xs text-muted-foreground">加载中...</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              剩余 {remaining} / {inviteData?.quota.total ?? 3} 个名额
            </p>

            {activeCodes.length > 0 && (
              <div className="space-y-2">
                {activeCodes.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 bg-muted/40 rounded-md px-3 py-2">
                    <span className="font-mono text-sm tracking-wider flex-1">{c.code}</span>
                    <button
                      onClick={() => copyLink(c.code, c.id)}
                      className="text-xs text-primary hover:underline shrink-0"
                    >
                      {copiedId === c.id ? "已复制" : "复制链接"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {usedCodes.length > 0 && (
              <div className="space-y-1">
                {usedCodes.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
                    <span className="font-mono tracking-wider line-through">{c.code}</span>
                    <span className="ml-auto">已使用</span>
                  </div>
                ))}
              </div>
            )}

            {remaining > 0 && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="text-xs text-primary hover:underline py-1.5 disabled:opacity-50"
              >
                {generating ? "生成中..." : "+ 生成新邀请码"}
              </button>
            )}
          </>
        )}
      </section>

      {/* 切换账号 */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">账号操作</h2>
        <button
          onClick={handleSwitchAccount}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          切换账号
        </button>
      </section>
    </div>
  );
}
