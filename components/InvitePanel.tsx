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

const APP_ORIGIN = typeof window !== "undefined" ? window.location.origin : "";

export function InvitePanel({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchCodes();
  }, []);

  async function fetchCodes() {
    try {
      const res = await fetch("/api/invitation/codes");
      setData(await res.json());
    } catch {
      setData({ codes: [], quota: { used: 0, total: 3 } });
    } finally {
      setLoading(false);
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
    const link = `${APP_ORIGIN}/activate?code=${code}`;
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

  const activeCodes = data?.codes.filter((c) => c.status === "ACTIVE") ?? [];
  const usedCodes = data?.codes.filter((c) => c.status === "REDEEMED") ?? [];
  const remaining = (data?.quota.total ?? 3) - (data?.quota.used ?? 0);

  return (
    <div className="absolute left-0 bottom-full mb-1 z-50 bg-popover border border-border rounded-lg shadow-lg w-72 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">邀请好友</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs">x</button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">加载中...</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            剩余 {remaining} / {data?.quota.total ?? 3} 个名额
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
              className="w-full text-center text-xs text-primary hover:underline py-1.5 disabled:opacity-50"
            >
              {generating ? "生成中..." : "+ 生成新邀请码"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
