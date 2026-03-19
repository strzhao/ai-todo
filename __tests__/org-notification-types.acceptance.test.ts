import { describe, it, expect } from "vitest";

// 验收测试：通知类型包含组织相关通知
// 红队验证者编写，基于设计文档，不依赖实现代码

describe("组织通知类型定义", () => {
  it("NOTIFICATION_TYPES 包含 org_join_pending 类型", async () => {
    const { NOTIFICATION_TYPES } = await import("@/lib/notification-types");
    expect(NOTIFICATION_TYPES).toHaveProperty("org_join_pending");
  });

  it("NOTIFICATION_TYPES 包含 org_member_approved 类型", async () => {
    const { NOTIFICATION_TYPES } = await import("@/lib/notification-types");
    expect(NOTIFICATION_TYPES).toHaveProperty("org_member_approved");
  });

  it("NOTIFICATION_TYPES 包含 org_member_removed 类型", async () => {
    const { NOTIFICATION_TYPES } = await import("@/lib/notification-types");
    expect(NOTIFICATION_TYPES).toHaveProperty("org_member_removed");
  });

  it("org_join_pending 通知有正确的结构", async () => {
    const { NOTIFICATION_TYPES } = await import("@/lib/notification-types");
    const type = (NOTIFICATION_TYPES as Record<string, unknown>)["org_join_pending"] as {
      label: string;
      category: string;
      defaultInapp: boolean;
      defaultEmail: boolean;
      defaultPush: boolean;
    };

    expect(type).toBeDefined();
    expect(type.label).toBeTruthy();
    expect(type.category).toBeDefined();
    expect(typeof type.defaultInapp).toBe("boolean");
    expect(typeof type.defaultEmail).toBe("boolean");
    expect(typeof type.defaultPush).toBe("boolean");
  });

  it("org_member_approved 通知有正确的结构", async () => {
    const { NOTIFICATION_TYPES } = await import("@/lib/notification-types");
    const type = (NOTIFICATION_TYPES as Record<string, unknown>)["org_member_approved"] as {
      label: string;
      category: string;
      defaultInapp: boolean;
      defaultEmail: boolean;
      defaultPush: boolean;
    };

    expect(type).toBeDefined();
    expect(type.label).toBeTruthy();
    expect(type.category).toBeDefined();
    expect(typeof type.defaultInapp).toBe("boolean");
  });

  it("org_member_removed 通知有正确的结构", async () => {
    const { NOTIFICATION_TYPES } = await import("@/lib/notification-types");
    const type = (NOTIFICATION_TYPES as Record<string, unknown>)["org_member_removed"] as {
      label: string;
      category: string;
      defaultInapp: boolean;
      defaultEmail: boolean;
      defaultPush: boolean;
    };

    expect(type).toBeDefined();
    expect(type.label).toBeTruthy();
    expect(type.category).toBeDefined();
    expect(typeof type.defaultInapp).toBe("boolean");
  });

  it("组织通知 category 为 org", async () => {
    const { NOTIFICATION_TYPES } = await import("@/lib/notification-types");
    const orgTypes = ["org_join_pending", "org_member_approved", "org_member_removed"];
    const ntypes = NOTIFICATION_TYPES as Record<string, { category: string }>;

    for (const key of orgTypes) {
      expect(ntypes[key]?.category, `${key} 的 category 应为 "org"`).toBe("org");
    }
  });

  it("NotificationCategory 类型包含 org", async () => {
    const { NOTIFICATION_TYPES } = await import("@/lib/notification-types");
    // 收集所有 category 值
    const categories = new Set(
      Object.values(NOTIFICATION_TYPES as Record<string, { category: string }>).map(
        (t) => t.category
      )
    );
    expect(categories.has("org")).toBe(true);
  });

  it("org_join_pending 默认开启应用内通知", async () => {
    const { NOTIFICATION_TYPES } = await import("@/lib/notification-types");
    const type = (NOTIFICATION_TYPES as Record<string, { defaultInapp: boolean }>)["org_join_pending"];
    // 有人申请加入组织，owner/admin 应该默认收到应用内通知
    expect(type.defaultInapp).toBe(true);
  });

  it("org_member_approved 默认开启应用内通知", async () => {
    const { NOTIFICATION_TYPES } = await import("@/lib/notification-types");
    const type = (NOTIFICATION_TYPES as Record<string, { defaultInapp: boolean }>)["org_member_approved"];
    // 加入申请通过，成员应该默认收到应用内通知
    expect(type.defaultInapp).toBe(true);
  });
});
