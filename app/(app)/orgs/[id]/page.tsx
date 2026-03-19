"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Organization, OrgMember, Task } from "@/lib/types";
import { getDisplayLabel } from "@/lib/display-utils";

interface Props {
  params: Promise<{ id: string }>;
}

type TabType = "spaces" | "members" | "settings";

export default function OrgDetailPage({ params }: Props) {
  const router = useRouter();
  const [orgId, setOrgId] = useState("");
  const [org, setOrg] = useState<(Organization & { my_role?: string; my_user_id?: string }) | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [spaces, setSpaces] = useState<(Task & { name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabType>("spaces");

  // Settings state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dissolveConfirm, setDissolveConfirm] = useState("");
  const [dissolving, setDissolving] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [joiningSpaceId, setJoiningSpaceId] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ id }) => {
      setOrgId(id);
      Promise.all([
        fetch(`/api/orgs/${id}`).then((r) => r.json()),
        fetch(`/api/orgs/${id}/spaces`).then((r) => r.json()),
      ]).then(([orgData, spacesData]) => {
        setOrg(orgData.org);
        setMembers(orgData.members);
        setName(orgData.org.name);
        setDescription(orgData.org.description || "");
        setSpaces(Array.isArray(spacesData) ? spacesData : []);
      }).finally(() => setLoading(false));
    });
  }, [params]);

  if (loading) {
    return (
      <div className="app-content">
        <div className="text-sm text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="app-content">
        <div className="text-sm text-muted-foreground">组织不存在</div>
      </div>
    );
  }

  const isOwner = org.my_role === "owner";
  const isAdmin = org.my_role === "admin";
  const canManageMembers = isOwner || isAdmin;
  const pendingMembers = members.filter((m) => m.status === "pending");
  const activeMembers = members.filter((m) => m.status === "active");

  function buildInviteLink() {
    if (!org?.invite_code) return "";
    return `${window.location.origin}/join/org/${org.invite_code}`;
  }

  function copyInviteLink() {
    const link = buildInviteLink();
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function saveSettings() {
    if (!name.trim()) return;
    setSaving(true);
    await fetch(`/api/orgs/${orgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
    });
    setSaving(false);
    setOrg((prev) => prev ? { ...prev, name: name.trim(), description: description.trim() || undefined } : prev);
  }

  async function removeMember(uid: string) {
    await fetch(`/api/orgs/${orgId}/members/${uid}`, { method: "DELETE" });
    setMembers((prev) => prev.filter((m) => m.user_id !== uid));
  }

  async function toggleAdmin(uid: string, currentRole: string) {
    const newRole = currentRole === "admin" ? "member" : "admin";
    const res = await fetch(`/api/orgs/${orgId}/members/${uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      const updated = await res.json() as OrgMember;
      setMembers((prev) => prev.map((m) => m.user_id === uid ? updated : m));
    }
  }

  async function approveMember(uid: string) {
    const res = await fetch(`/api/orgs/${orgId}/members/${uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    const updated = await res.json() as OrgMember;
    setMembers((prev) => prev.map((m) => m.user_id === uid ? updated : m));
  }

  async function dissolveOrg() {
    if (dissolveConfirm !== org?.name) return;
    setDissolving(true);
    await fetch(`/api/orgs/${orgId}`, { method: "DELETE" });
    window.location.href = "/orgs";
  }

  async function leaveOrg() {
    if (!org?.my_user_id) return;
    setLeaving(true);
    await fetch(`/api/orgs/${orgId}/members/${org.my_user_id}`, { method: "DELETE" });
    window.location.href = "/orgs";
  }

  async function joinSpace(spaceId: string) {
    setJoiningSpaceId(spaceId);
    try {
      const res = await fetch(`/api/orgs/${orgId}/spaces/${spaceId}/join`, { method: "POST" });
      const data = await res.json() as { space_id: string; status: string };
      if (data.status === "active") {
        router.push(`/spaces/${spaceId}`);
      } else {
        // Show pending feedback
        alert("申请已提交，等待空间管理员审批");
      }
    } catch {
      alert("操作失败，请重试");
    } finally {
      setJoiningSpaceId(null);
    }
  }

  const tabs: { key: TabType; label: string }[] = [
    { key: "spaces", label: `空间 (${spaces.length})` },
    { key: "members", label: `成员 (${activeMembers.length})` },
    { key: "settings", label: "设置" },
  ];

  return (
    <div className="app-content">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-sage-mist flex items-center justify-center text-sage font-bold text-2xl flex-shrink-0">
          {org.name[0]?.toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-semibold">{org.name}</h1>
          {org.description && (
            <p className="text-sm text-muted-foreground mt-0.5">{org.description}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/60 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? "border-sage text-sage font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Spaces Tab */}
      {tab === "spaces" && (
        <div className="space-y-2">
          {spaces.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">还没有关联的空间</p>
              <p className="text-xs text-muted-foreground mt-1">在创建空间时可选择关联到此组织</p>
            </div>
          ) : (
            spaces.map((space) => (
              <div key={space.id} className="flex items-center gap-3 p-4 border border-border/60 rounded-lg">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold text-lg flex-shrink-0">
                  {(space.name ?? space.title)[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{space.name ?? space.title}</p>
                  {space.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{space.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {space.member_count ?? 0} 名成员 · {space.task_count ?? 0} 个待办
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {space.my_role ? (
                    <Link href={`/spaces/${space.id}`}>
                      <Button size="sm" variant="outline" className="text-xs">
                        进入空间
                      </Button>
                    </Link>
                  ) : (
                    <>
                      <Link href={`/spaces/${space.id}`}>
                        <Button size="sm" variant="ghost" className="text-xs">
                          查看
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => joinSpace(space.id)}
                        disabled={joiningSpaceId === space.id}
                      >
                        {joiningSpaceId === space.id ? "申请中..." : "申请加入"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Members Tab */}
      {tab === "members" && (
        <div className="space-y-6">
          {/* Pending Members */}
          {canManageMembers && pendingMembers.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">待审批 ({pendingMembers.length})</h2>
              <div className="space-y-2">
                {pendingMembers.map((m) => (
                  <div key={m.user_id} className="flex items-center gap-3 py-2">
                    <div className="flex-1">
                      <p className="text-sm">{getDisplayLabel(m.email, m)}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => approveMember(m.user_id)}>同意</Button>
                    <Button size="sm" variant="ghost" onClick={() => removeMember(m.user_id)}>拒绝</Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Active Members */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">成员 ({activeMembers.length})</h2>
            <div className="space-y-1">
              {activeMembers.map((m) => (
                <div key={m.user_id} className="flex items-center gap-3 py-2 border-b last:border-0 border-border/40">
                  <div className="w-7 h-7 rounded-full bg-sage-mist flex items-center justify-center text-sage text-xs font-medium flex-shrink-0">
                    {getDisplayLabel(m.email, m)[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{getDisplayLabel(m.email, m)}</p>
                    {m.nickname && <p className="text-xs text-muted-foreground">{m.email}</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {m.role === "owner" && (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">创建者</span>
                    )}
                    {m.role === "admin" && (
                      <span className="text-[10px] text-sage bg-sage-mist px-1.5 py-0.5 rounded">管理员</span>
                    )}
                    {isOwner && m.role !== "owner" && (
                      <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => toggleAdmin(m.user_id, m.role)}>
                        {m.role === "admin" ? "取消管理员" : "设为管理员"}
                      </Button>
                    )}
                    {m.role !== "owner" && ((m.role === "member" && canManageMembers) || (m.role === "admin" && isOwner)) && (
                      <Button size="sm" variant="ghost" className="text-xs h-7 text-muted-foreground" onClick={() => removeMember(m.user_id)}>
                        移除
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Settings Tab */}
      {tab === "settings" && (
        <div className="space-y-8">
          {/* Basic Info */}
          {isOwner && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">基本信息</h2>
              <div>
                <label className="text-xs text-muted-foreground">组织名称</label>
                <div className="flex gap-2 mt-1">
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                  <Button size="sm" onClick={saveSettings} disabled={saving || !name.trim()}>
                    {saving ? "保存..." : "保存"}
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">描述</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="简要描述这个组织"
                  className="mt-1 resize-none"
                  rows={2}
                />
              </div>
            </section>
          )}

          {/* Invite Link */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">邀请链接</h2>
            <div className="flex gap-2">
              <div className="flex-1 text-xs bg-muted rounded px-3 py-2 font-mono truncate text-muted-foreground">
                {buildInviteLink()}
              </div>
              <Button size="sm" variant="outline" onClick={copyInviteLink}>
                {copied ? "已复制" : "复制"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              通过链接可直接加入组织
            </p>
          </section>

          {/* Leave (non-owner) */}
          {!isOwner && (
            <section className="space-y-3 border-t border-border/40 pt-6">
              <h2 className="text-sm font-semibold">退出组织</h2>
              <p className="text-xs text-muted-foreground">
                退出后将无法访问组织内的空间列表和成员信息。
              </p>
              {!leaveConfirm ? (
                <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setLeaveConfirm(true)}>
                  退出组织
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="destructive" onClick={leaveOrg} disabled={leaving}>
                    {leaving ? "退出中..." : "确认退出"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setLeaveConfirm(false)} disabled={leaving}>
                    取消
                  </Button>
                </div>
              )}
            </section>
          )}

          {/* Danger Zone (owner only) */}
          {isOwner && (
            <section className="space-y-3 border-t border-destructive/20 pt-6">
              <h2 className="text-sm font-semibold text-destructive">危险操作</h2>
              <p className="text-xs text-muted-foreground">解散组织后，关联的空间不会被删除，但会解除与组织的关联。</p>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">输入组织名称确认：<strong>{org.name}</strong></label>
                <div className="flex gap-2">
                  <Input
                    value={dissolveConfirm}
                    onChange={(e) => setDissolveConfirm(e.target.value)}
                    placeholder={org.name}
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={dissolveOrg}
                    disabled={dissolveConfirm !== org.name || dissolving}
                  >
                    {dissolving ? "解散中..." : "解散组织"}
                  </Button>
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
