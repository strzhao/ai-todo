"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface Props {
  params: Promise<{ code: string }>;
}

interface OrgPreview {
  id: string;
  name: string;
  description?: string;
  member_count: number;
}

export default function JoinOrgPage({ params }: Props) {
  const router = useRouter();
  const [preview, setPreview] = useState<OrgPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [status, setStatus] = useState<"idle" | "joined" | "pending" | "error">("idle");
  const [error, setError] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  useEffect(() => {
    params.then(({ code }) => {
      setInviteCode(code);
      fetch(`/api/orgs/join/${code}`)
        .then(async (r) => {
          if (!r.ok) throw new Error("Invite link not found");
          return r.json() as Promise<OrgPreview>;
        })
        .then(setPreview)
        .catch(() => setError("邀请链接无效或已失效"))
        .finally(() => setLoading(false));
    });
  }, [params]);

  async function handleJoin() {
    if (!inviteCode) return;
    setJoining(true);
    try {
      const res = await fetch(`/api/orgs/join/${inviteCode}`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error || "加入失败");
        setStatus("error");
        return;
      }
      const data = await res.json() as { org_id: string; status: string };
      if (data.status === "active") {
        setStatus("joined");
        setTimeout(() => router.push(`/orgs/${data.org_id}`), 1500);
      } else {
        setStatus("pending");
      }
    } catch {
      setError("网络错误，请重试");
      setStatus("error");
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">AI Todo</h1>
        </div>

        {error && !preview ? (
          <div className="text-center py-8 space-y-4">
            <div className="text-4xl">🔗</div>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={() => router.push("/")}>返回首页</Button>
          </div>
        ) : preview && (
          <div className="border border-border rounded-xl p-6 space-y-5">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-sage-mist flex items-center justify-center text-sage font-bold text-3xl mx-auto mb-3">
                {preview.name[0]?.toUpperCase()}
              </div>
              <h2 className="text-lg font-semibold">{preview.name}</h2>
              {preview.description && (
                <p className="text-xs text-muted-foreground mt-1">{preview.description}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {preview.member_count} 名成员
              </p>
            </div>

            {status === "idle" && (
              <Button className="w-full" onClick={handleJoin} disabled={joining}>
                {joining ? "加入中..." : "加入组织"}
              </Button>
            )}

            {status === "joined" && (
              <div className="text-center text-sm text-sage">
                加入成功！正在跳转...
              </div>
            )}

            {status === "pending" && (
              <div className="text-center space-y-2">
                <p className="text-sm font-medium">申请已提交</p>
                <p className="text-xs text-muted-foreground">等待管理员审批后即可访问组织</p>
                <Button variant="outline" size="sm" onClick={() => router.push("/")}>返回首页</Button>
              </div>
            )}

            {status === "error" && (
              <div className="text-center space-y-2">
                <p className="text-xs text-destructive">{error}</p>
                <Button variant="outline" size="sm" onClick={() => setStatus("idle")}>重试</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
