"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Space } from "@/lib/types";

export default function SpacesPage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/spaces")
      .then((r) => r.json())
      .then((data: Space[]) => setSpaces(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-sm text-muted-foreground">加载中...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">项目空间</h1>
        <Link href="/spaces/new">
          <Button size="sm">+ 新建空间</Button>
        </Link>
      </div>

      {spaces.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">👥</div>
          <p className="text-sm font-medium">还没有项目空间</p>
          <p className="text-xs text-muted-foreground mt-1">创建一个空间，邀请成员协同管理任务</p>
          <Link href="/spaces/new">
            <Button size="sm" variant="outline" className="mt-4">创建第一个空间</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {spaces.map((space) => (
            <Link key={space.id} href={`/spaces/${space.id}`}>
              <div className="flex items-center gap-3 p-4 border border-border/60 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold text-lg flex-shrink-0">
                  {space.title[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{space.title}</p>
                  {space.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{space.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {space.member_count ?? 0} 名成员 · {space.task_count ?? 0} 个待办
                  </p>
                </div>
                {space.my_role === "owner" && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">管理员</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
