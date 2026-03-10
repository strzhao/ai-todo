"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { NotificationSettings } from "./NotificationSettings";

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
  userNickname?: string;
  isDev?: boolean;
}

export function AccountContent({ userEmail, userNickname, isDev }: Props) {
  const router = useRouter();
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [inviteLoading, setInviteLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nickname, setNickname] = useState(userNickname ?? "");
  const [saving, setSaving] = useState(false);
  const nicknameInputRef = useRef<HTMLInputElement>(null);

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

  async function saveNickname() {
    const trimmed = nickname.trim();
    if (trimmed === (userNickname ?? "")) {
      setEditingNickname(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: trimmed }),
      });
      if (res.ok) {
        setEditingNickname(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  function handleSwitchAccount() {
    window.location.href = "/api/auth/switch-account";
  }

  const codes = (inviteData?.codes ?? []).filter((c) => c.status !== "REVOKED");
  const redeemedCount = codes.filter((c) => c.status === "REDEEMED").length;

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
      <h1 className="text-lg font-semibold">账号设置</h1>

      {/* 账号信息 */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">账号信息</h2>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-12 shrink-0">邮箱</span>
            <p className="text-sm">{userEmail}</p>
            {isDev && (
              <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                DEV
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-12 shrink-0">昵称</span>
            {editingNickname ? (
              <input
                ref={nicknameInputRef}
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onBlur={saveNickname}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveNickname();
                  if (e.key === "Escape") { setNickname(userNickname ?? ""); setEditingNickname(false); }
                }}
                maxLength={20}
                disabled={saving}
                placeholder="设置昵称"
                className="text-sm border-b border-primary bg-transparent outline-none py-0.5 w-40"
                autoFocus
              />
            ) : (
              <button
                onClick={() => { setEditingNickname(true); setTimeout(() => nicknameInputRef.current?.focus(), 0); }}
                className="text-sm hover:text-primary transition-colors"
              >
                {userNickname || <span className="text-muted-foreground">设置昵称</span>}
              </button>
            )}
          </div>
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
              已使用 {redeemedCount} / {codes.length} 个邀请码
            </p>

            <div className="space-y-2">
              {codes.map((c) => (
                <div key={c.id} className="flex items-center gap-2 bg-muted/40 rounded-md px-3 py-2">
                  <span className={`font-mono text-sm tracking-wider flex-1 ${c.status === "REDEEMED" ? "line-through text-muted-foreground" : ""}`}>
                    {c.code}
                  </span>
                  {c.status === "ACTIVE" ? (
                    <button
                      onClick={() => copyLink(c.code, c.id)}
                      className="text-xs text-primary hover:underline shrink-0"
                    >
                      {copiedId === c.id ? "已复制" : "复制链接"}
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground shrink-0">已使用</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* 通知设置 */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">通知设置</h2>
        <NotificationSettings />
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
