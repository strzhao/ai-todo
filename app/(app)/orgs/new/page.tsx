"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Organization } from "@/lib/types";

export default function NewOrgPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
      });

      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error || "创建失败");
        return;
      }

      const org = await res.json() as Organization;
      window.location.href = `/orgs/${org.id}`;
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">新建团队组织</h1>
        <p className="text-sm text-muted-foreground mt-0.5">创建组织后可邀请成员加入，统一管理多个项目空间</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium">组织名称 *</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：产品团队、研发中心、家庭"
            className="mt-1"
            required
          />
        </div>

        <div>
          <label className="text-sm font-medium">描述（可选）</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="简要描述这个组织的用途"
            className="mt-1 resize-none"
            rows={2}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={!name.trim() || loading}>
            {loading ? "创建中..." : "创建组织"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>取消</Button>
        </div>
      </form>
    </div>
  );
}
