"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SummarySettings } from "@/components/SummarySettings";
import type { Space } from "@/lib/types";

interface Props {
  params: Promise<{ id: string }>;
}

export default function SummarySettingsPage({ params }: Props) {
  const [spaceId, setSpaceId] = useState("");
  const [space, setSpace] = useState<Space | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    params.then(({ id }) => {
      setSpaceId(id);
      fetch(`/api/spaces/${id}`)
        .then((r) => {
          if (!r.ok) throw new Error(r.status === 403 ? "无权访问" : "加载失败");
          return r.json();
        })
        .then((data) => {
          const role = data.space?.my_role;
          if (role !== "owner" && role !== "admin") {
            setError("仅空间管理员可配置 AI 总结");
            return;
          }
          setSpace(data.space);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    });
  }, [params]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin mr-2" />
        加载中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          onClick={() => router.back()}
          className="text-sm text-sage hover:underline mt-2"
        >
          返回
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => router.push(`/spaces/${spaceId}?tab=summary`)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {space?.title ?? "空间"}
        </button>
        <span className="text-muted-foreground/40">·</span>
        <h1 className="text-sm font-semibold">AI 总结设置</h1>
      </div>

      {spaceId && (
        <SummarySettings
          spaceId={spaceId}
          spaceName={space?.title ?? ""}
        />
      )}
    </div>
  );
}
