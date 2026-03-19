"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Organization } from "@/lib/types";

export default function OrgsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/orgs")
      .then((r) => r.json())
      .then((data: Organization[]) => setOrgs(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="app-content">
        <div className="text-sm text-muted-foreground">加载中...</div>
      </div>
    );
  }

  return (
    <div className="app-content">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">团队组织</h1>
        <Link href="/orgs/new">
          <Button size="sm">+ 新建组织</Button>
        </Link>
      </div>

      {orgs.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🏢</div>
          <p className="text-sm font-medium">还没有团队组织</p>
          <p className="text-xs text-muted-foreground mt-1">创建组织，统一管理多个项目空间和成员</p>
          <Link href="/orgs/new">
            <Button size="sm" variant="outline" className="mt-4">创建第一个组织</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {orgs.map((org) => (
            <Link key={org.id} href={`/orgs/${org.id}`}>
              <div className="flex items-center gap-3 p-4 border border-border/60 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-sage-mist flex items-center justify-center text-sage font-bold text-lg flex-shrink-0">
                  {org.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{org.name}</p>
                  {org.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{org.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {org.member_count ?? 0} 名成员 · {org.space_count ?? 0} 个空间
                  </p>
                </div>
                {org.my_role === "owner" && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">创建者</span>
                )}
                {org.my_role === "admin" && (
                  <span className="text-[10px] text-sage bg-sage-mist px-1.5 py-0.5 rounded">管理员</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
