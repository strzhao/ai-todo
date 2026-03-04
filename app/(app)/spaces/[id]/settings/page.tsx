"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Space, SpaceMember } from "@/lib/types";

interface Props {
  params: Promise<{ id: string }>;
}

export default function SpaceSettingsPage({ params }: Props) {
  const [spaceId, setSpaceId] = useState("");
  const [space, setSpace] = useState<Space | null>(null);
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dissolveConfirm, setDissolveConfirm] = useState("");
  const [dissolving, setDissolving] = useState(false);

  useEffect(() => {
    params.then(({ id }) => {
      setSpaceId(id);
      fetch(`/api/spaces/${id}`)
        .then((r) => r.json())
        .then((data: { space: Space; members: SpaceMember[] }) => {
          setSpace(data.space);
          setMembers(data.members);
          setName(data.space.name);
        })
        .finally(() => setLoading(false));
    });
  }, [params]);

  async function saveSettings() {
    if (!name.trim()) return;
    setSaving(true);
    await fetch(`/api/spaces/${spaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setSaving(false);
  }

  function copyInviteLink() {
    if (!space) return;
    const link = `${typeof window !== "undefined" ? window.location.origin : ""}/join/${space.invite_code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function removeMember(uid: string) {
    await fetch(`/api/spaces/${spaceId}/members/${uid}`, { method: "DELETE" });
    setMembers((prev) => prev.filter((m) => m.user_id !== uid));
  }

  async function approveMember(uid: string) {
    const res = await fetch(`/api/spaces/${spaceId}/members/${uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    const updated = await res.json() as SpaceMember;
    setMembers((prev) => prev.map((m) => m.user_id === uid ? updated : m));
  }

  async function dissolveSpace() {
    if (dissolveConfirm !== space?.name) return;
    setDissolving(true);
    await fetch(`/api/spaces/${spaceId}`, { method: "DELETE" });
    window.location.href = "/spaces";
  }

  if (loading) {
    return <div className="max-w-lg mx-auto px-4 py-8 text-sm text-muted-foreground">加载中...</div>;
  }

  if (!space) {
    return <div className="max-w-lg mx-auto px-4 py-8 text-sm text-muted-foreground">空间不存在</div>;
  }

  const isOwner = space.my_role === "owner";
  const pendingMembers = members.filter((m) => m.status === "pending");
  const activeMembers = members.filter((m) => m.status === "active");
  const inviteLink = `${typeof window !== "undefined" ? window.location.origin : ""}/join/${space.invite_code}`;

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold">{space.name} · 设置</h1>
      </div>

      {/* Basic Info */}
      {isOwner && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">基本信息</h2>
          <div>
            <label className="text-xs text-muted-foreground">空间名称</label>
            <div className="flex gap-2 mt-1">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
              <Button size="sm" onClick={saveSettings} disabled={saving || !name.trim()}>
                {saving ? "保存..." : "保存"}
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Invite Link */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">邀请链接</h2>
        <div className="flex gap-2">
          <div className="flex-1 text-xs bg-muted rounded px-3 py-2 font-mono truncate text-muted-foreground">
            {inviteLink}
          </div>
          <Button size="sm" variant="outline" onClick={copyInviteLink}>
            {copied ? "已复制" : "复制"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {space.invite_mode === "open" ? "任何人通过链接可直接加入" : "通过链接加入需要管理员审批"}
        </p>
      </section>

      {/* Pending Members */}
      {isOwner && pendingMembers.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">待审批成员 ({pendingMembers.length})</h2>
          <div className="space-y-2">
            {pendingMembers.map((m) => (
              <div key={m.user_id} className="flex items-center gap-3 py-2">
                <div className="flex-1">
                  <p className="text-sm">{m.display_name || m.email}</p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => approveMember(m.user_id)}>同意</Button>
                <Button size="sm" variant="ghost" onClick={() => removeMember(m.user_id)}>拒绝</Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Members */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">成员 ({activeMembers.length})</h2>
        <div className="space-y-1">
          {activeMembers.map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 py-2 border-b last:border-0 border-border/40">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-medium flex-shrink-0">
                {(m.display_name || m.email)[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{m.display_name || m.email}</p>
                {m.display_name && <p className="text-xs text-muted-foreground">{m.email}</p>}
              </div>
              {m.role === "owner" ? (
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">管理员</span>
              ) : isOwner ? (
                <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => removeMember(m.user_id)}>
                  移除
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {/* Danger Zone */}
      {isOwner && (
        <section className="space-y-3 border-t border-destructive/20 pt-6">
          <h2 className="text-sm font-semibold text-destructive">危险操作</h2>
          <p className="text-xs text-muted-foreground">解散空间后，所有任务将归还到各成员的个人任务中，无法撤销。</p>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">输入空间名称确认：<strong>{space.name}</strong></label>
            <div className="flex gap-2">
              <Input
                value={dissolveConfirm}
                onChange={(e) => setDissolveConfirm(e.target.value)}
                placeholder={space.name}
              />
              <Button
                size="sm"
                variant="destructive"
                onClick={dissolveSpace}
                disabled={dissolveConfirm !== space.name || dissolving}
              >
                {dissolving ? "解散中..." : "解散空间"}
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
