"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Space, Organization } from "@/lib/types";

export default function NewSpacePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inviteMode, setInviteMode] = useState<"open" | "approval">("open");
  const [orgId, setOrgId] = useState<string>("");
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/orgs")
      .then((r) => r.json())
      .then((data: Organization[]) => {
        if (Array.isArray(data)) setOrgs(data);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          invite_mode: inviteMode,
          org_id: orgId || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error || "创建失败");
        return;
      }

      const space = await res.json() as Space;
      // 使用整页导航而非 router.push，确保 Server Component layout 重新执行
      // getSpacesByUser()，新空间才会出现在侧边栏。
      window.location.href = `/spaces/${space.id}`;
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">新建项目空间</h1>
        <p className="text-sm text-muted-foreground mt-0.5">创建后可通过链接邀请成员加入</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium">空间名称 *</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：前端团队、2026 OKR、家庭计划"
            className="mt-1"
            required
          />
        </div>

        <div>
          <label className="text-sm font-medium">描述（可选）</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="简要描述这个空间的用途"
            className="mt-1 resize-none"
            rows={2}
          />
        </div>

        {orgs.length > 0 && (
          <div>
            <label className="text-sm font-medium">所属组织（可选）</label>
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-border/60 bg-background px-3 text-sm"
            >
              <option value="">不关联组织</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">关联后空间将出现在组织的空间列表中</p>
          </div>
        )}

        <div>
          <label className="text-sm font-medium">加入方式</label>
          <div className="mt-1 flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="open"
                checked={inviteMode === "open"}
                onChange={() => setInviteMode("open")}
                className="accent-primary"
              />
              <span className="text-sm">自由加入（有链接即可）</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="approval"
                checked={inviteMode === "approval"}
                onChange={() => setInviteMode("approval")}
                className="accent-primary"
              />
              <span className="text-sm">需要审批</span>
            </label>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={!name.trim() || loading}>
            {loading ? "创建中..." : "创建空间"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>取消</Button>
        </div>
      </form>
    </div>
  );
}
