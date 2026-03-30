"use client";

import Link from "next/link";
import type { AppNotification, DailyDigestMetric, DailyDigestSectionItem } from "@/lib/types";
import { getNotificationUrl } from "@/lib/notification-utils";

const metricToneCls: Record<DailyDigestMetric["key"], string> = {
  overdue: "border-warning/30 bg-warning/10 text-warning",
  due_today: "border-info/20 bg-info/10 text-info",
  completed: "border-sage/25 bg-sage-mist text-sage",
  logs: "border-border bg-muted/60 text-charcoal",
};

function getItemHref(item: DailyDigestSectionItem): string | null {
  if (!item.task_id && !item.space_id) return null;
  return getNotificationUrl({ task_id: item.task_id, space_id: item.space_id });
}

function DigestItem({ item }: { item: DailyDigestSectionItem }) {
  const href = getItemHref(item);

  return (
    <div className="rounded-xl border border-border/70 bg-background px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {href ? (
            <Link
              href={href}
              className="text-sm font-medium text-foreground leading-6 hover:text-sage transition-colors"
            >
              {item.title}
            </Link>
          ) : (
            <p className="text-sm font-medium text-foreground leading-6">{item.title}</p>
          )}
          {item.meta && (
            <p className="mt-1 text-xs text-muted-foreground leading-5">{item.meta}</p>
          )}
          {item.excerpt && (
            <p className="mt-2 text-sm text-foreground/80 leading-6 whitespace-pre-wrap">
              {item.excerpt}
            </p>
          )}
        </div>
        {href && (
          <Link
            href={href}
            className="shrink-0 text-xs text-info hover:text-info/80 transition-colors"
          >
            查看
          </Link>
        )}
      </div>
    </div>
  );
}

export function DailyDigestNotificationDetail({ notification }: { notification: AppNotification }) {
  const digest = notification.data?.daily_digest;

  if (!digest) {
    return (
      <div className="px-1 py-4 space-y-3">
        <h3 className="text-base font-medium text-foreground">{notification.title}</h3>
        {notification.body && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {notification.body}
          </p>
        )}
        <p className="text-xs text-muted-foreground/70">
          这是旧版每日摘要通知，未保存结构化明细。
        </p>
      </div>
    );
  }

  return (
    <div className="px-1 py-4 space-y-5">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{notification.title}</p>
        <h3 className="text-lg font-medium text-foreground leading-7">{digest.headline}</h3>
        <p className="text-sm text-muted-foreground leading-6">
          这是发送时的摘要快照，帮助你先判断今天优先看什么。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {digest.metrics.map((metric) => (
          <div
            key={metric.key}
            className={`rounded-xl border px-3 py-3 ${metricToneCls[metric.key]}`}
          >
            <p className="text-xs font-medium">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold leading-none">{metric.count}</p>
          </div>
        ))}
      </div>

      {digest.sections.map((section) => (
        <section key={section.key} className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h4 className="text-sm font-medium text-foreground">{section.title}</h4>
              <p className="text-xs text-muted-foreground mt-1">
                共 {section.count} 项
                {section.overflow_count > 0 ? `，这里展示前 ${section.items.length} 项` : ""}
              </p>
            </div>
            {section.overflow_count > 0 && (
              <span className="text-xs text-muted-foreground">
                另 {section.overflow_count} 项
              </span>
            )}
          </div>

          <div className="space-y-2">
            {section.items.map((item) => (
              <DigestItem
                key={`${section.key}-${item.task_id ?? item.title}-${item.excerpt ?? ""}`}
                item={item}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="rounded-xl border border-sage/20 bg-sage-mist/70 px-4 py-3">
        <p className="text-sm text-charcoal leading-6">
          摘要只保留最关键的明细。点进具体任务后可以继续编辑、补日志或直接处理。
        </p>
      </div>
    </div>
  );
}
