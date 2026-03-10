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

/* ── 局部组件 ── */

function SettingsCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section>
      {title && (
        <h2 className="text-xs font-medium text-muted-foreground mb-2 px-1">{title}</h2>
      )}
      <div className="rounded-xl bg-card border border-border divide-y divide-border overflow-hidden">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({ icon, label, value, action, onClick, destructive }: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  value?: React.ReactNode;
  action?: React.ReactNode;
  onClick?: () => void;
  destructive?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 w-full text-left ${onClick ? "hover:bg-muted/40 transition-colors" : ""}`}
    >
      {icon && (
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
          destructive ? "bg-destructive/10 text-destructive" : "bg-sage-mist text-sage"
        }`}>
          {icon}
        </span>
      )}
      <span className={`text-sm flex-1 min-w-0 ${destructive ? "text-destructive" : "text-foreground"}`}>
        {label}
      </span>
      {value && <span className="text-sm text-muted-foreground shrink-0">{value}</span>}
      {action}
      {onClick && (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-muted-foreground shrink-0">
          <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      )}
    </Comp>
  );
}

/* ── SVG Icons ── */

const PencilIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
    <path d="M13.488 2.513a1.75 1.75 0 0 0-2.476 0L3.84 9.686a2.25 2.25 0 0 0-.575 1.005l-.5 1.874a.75.75 0 0 0 .926.926l1.874-.5a2.25 2.25 0 0 0 1.005-.575l7.173-7.173a1.75 1.75 0 0 0 0-2.475l-.255-.255Z" />
  </svg>
);

const TicketIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
    <path d="M1.75 2A1.75 1.75 0 0 0 0 3.75v2.104a.75.75 0 0 0 .573.729A1.25 1.25 0 0 1 0 7.834v.332a1.25 1.25 0 0 1 .573 1.251.75.75 0 0 0-.573.73v2.103c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0 0 16 12.25v-2.104a.75.75 0 0 0-.573-.729A1.25 1.25 0 0 1 16 8.166v-.332a1.25 1.25 0 0 1-.573-1.251.75.75 0 0 0 .573-.73V3.75A1.75 1.75 0 0 0 14.25 2H1.75Z" />
  </svg>
);

const SwitchIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
    <path fillRule="evenodd" d="M8 1a.75.75 0 0 1 .75.75v1.69l1.22-1.22a.75.75 0 1 1 1.06 1.06L8.75 5.56V8a.75.75 0 0 1-1.5 0V5.56L4.97 3.28a.75.75 0 0 1 1.06-1.06l1.22 1.22V1.75A.75.75 0 0 1 8 1ZM4.25 8.5a3.75 3.75 0 1 0 7.5 0h1.5a5.25 5.25 0 1 1-10.5 0h1.5Z" clipRule="evenodd" />
  </svg>
);

/* ── 主组件 ── */

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
  const initial = userEmail[0].toUpperCase();
  const displayName = userNickname || userEmail.split("@")[0];

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

      {/* ── Profile Header ── */}
      <div className="rounded-2xl bg-card border border-border p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-sage-mist flex items-center justify-center shrink-0">
            <span className="text-sage text-lg font-semibold">{initial}</span>
          </div>
          <div className="flex-1 min-w-0">
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
                className="text-base font-semibold bg-transparent border-b border-sage outline-none w-full text-foreground"
                autoFocus
              />
            ) : (
              <p className="text-base font-semibold text-foreground truncate">{displayName}</p>
            )}
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
              {isDev && (
                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-sage-mist text-sage shrink-0">
                  DEV
                </span>
              )}
            </div>
          </div>
          {!editingNickname && (
            <button
              onClick={() => { setEditingNickname(true); setTimeout(() => nicknameInputRef.current?.focus(), 0); }}
              className="text-muted-foreground hover:text-foreground transition-colors p-1.5 shrink-0"
              aria-label="编辑昵称"
            >
              {PencilIcon}
            </button>
          )}
        </div>
      </div>

      {/* ── 邀请好友 ── */}
      <SettingsCard title="邀请好友">
        {inviteLoading && (
          <div className="px-4 py-3 space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-4 w-32 bg-muted rounded animate-pulse" />
            ))}
          </div>
        )}
        {!inviteLoading && codes.length === 0 && (
          <div className="px-4 py-3">
            <p className="text-sm text-muted-foreground">暂无邀请码</p>
          </div>
        )}
        {!inviteLoading && codes.length > 0 && codes.map((c) => (
          <SettingsRow
            key={c.id}
            icon={TicketIcon}
            label={
              <span className={`font-mono tracking-wider ${c.status === "REDEEMED" ? "line-through text-muted-foreground" : ""}`}>
                {c.code}
              </span>
            }
            action={
              c.status === "ACTIVE" ? (
                <button
                  onClick={(e) => { e.stopPropagation(); copyLink(c.code, c.id); }}
                  className="text-xs text-sage font-medium hover:underline shrink-0"
                >
                  {copiedId === c.id ? "已复制" : "复制链接"}
                </button>
              ) : (
                <span className="text-xs text-muted-foreground shrink-0">已使用</span>
              )
            }
          />
        ))}
      </SettingsCard>
      {!inviteLoading && codes.length > 0 && (
        <p className="text-xs text-muted-foreground px-1 -mt-3">
          已使用 {redeemedCount} / {codes.length} 个邀请码
        </p>
      )}

      {/* ── 通知设置 ── */}
      <SettingsCard title="通知设置">
        <NotificationSettings />
      </SettingsCard>

      {/* ── 账号操作 ── */}
      <SettingsCard title="账号操作">
        <SettingsRow
          icon={SwitchIcon}
          label="切换账号"
          onClick={handleSwitchAccount}
          destructive
        />
      </SettingsCard>
    </div>
  );
}
