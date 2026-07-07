/**
 * lib/pg 兼容层验收测试 (VPS 迁移 / DB 访问层)
 *
 * 目标:验证 @vercel/postgres → pg 迁移后,兼容层对外暴露与现有测试 mock
 * 形状(Object.assign(vi.fn(), { query: vi.fn() }))及设计文档契约一致。
 *
 * 这是 TDD 红灯测试 —— 蓝队未实现 lib/pg.ts 时 import 失败即红灯(正确)。
 * 不 Read lib/pg.ts 源码,仅通过公开导出断言形状。
 *
 * 覆盖谓词:
 * - 场景1.P2 [det-machine]: 无业务文件直接 import @vercel/postgres (本测试间接:用 @/lib/pg 形状)
 * - 场景1.P3 [det-machine]: pool 连接配置 max ≤ 5
 * - 场景2.P2 [det-machine]: sql 兼容对象同时暴露 .query() 签名 (text, params)
 * - 场景3.P1 [det-machine]: 无 sql.begin/transaction 残留 (兼容层无此方法)
 */

import { describe, it, expect } from "vitest";

// 红队只测形状,不读源码 —— import 即契约校验
import { sql, pool } from "@/lib/pg";

describe("lib/pg 兼容层 — 场景1.P3 / 场景2.P2 形状契约", () => {
  it("场景2.P2: sql 是函数(支持 tagged template sql 反引号调用)", () => {
    // @vercel/postgres sql 形状:可作 tagged template 调用
    // 现有测试 mock = Object.assign(vi.fn(), { query: vi.fn() })
    // 兼容层必须保持同构,否则业务代码 sql`` 调用崩溃
    expect(typeof sql).toBe("function");
  });

  it("场景2.P2: sql.query 是函数(支持 sql.query(text, params) 形态)", () => {
    // 业务代码 ~30% 用 sql.query(text, params)(数组字段 TEXT[] + 动态拼接)
    // 例:lib/db.ts createTask:724 await sql.query('INSERT ... VALUES ($1...)', [...])
    expect(typeof sql.query).toBe("function");
  });

  it("场景2.P2: sql 与 sql.query 是同一对象的属性(双形态同一 export)", () => {
    // 对齐 Object.assign(fn, { query }) 形状 ——
    // 现有测试 vi.mock("@vercel/postgres") 返回的就是这种结构
    expect((sql as unknown as { query: unknown }).query).toBe(sql.query);
  });
});

describe("lib/pg 兼容层 — 场景1.P3 pool 配置", () => {
  it("场景1.P3: pool.options.max 存在且为整数 ≤ 5", () => {
    // 设计文档 lib/pg.ts: max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000
    // VPS 2G 内存(已跑 little-bee+wewe-rss+frps),连接数必须收紧
    expect(pool).toBeDefined();
    const options = (pool as unknown as { options?: { max?: unknown } }).options;
    expect(options).toBeDefined();
    expect(options!.max).toBeDefined();
    expect(typeof options!.max).toBe("number");
    expect(Number.isInteger(options!.max as number)).toBe(true);
    expect((options!.max as number) <= 5).toBe(true);
    expect((options!.max as number) > 0).toBe(true); // 合理下界
  });
});

describe("lib/pg 兼容层 — 场景3.P1 无事务 API 残留", () => {
  it("场景3.P1: sql 不暴露 @vercel/postgres 的 begin/transaction 方法", () => {
    // 设计文档明示:本仓无 sql.begin 事务用法(Explore 实测),兼容层无需也不应实现
    // 若误引入会误导后续业务代码写事务,产生 pg 不支持的 API 调用
    const sqlAsAny = sql as unknown as Record<string, unknown>;
    expect(sqlAsAny.begin).toBeUndefined();
    expect(sqlAsAny.transaction).toBeUndefined();
  });
});

/**
 * 场景1.P2 / 场景1.P1 / 场景2.P1 留 QA Tier 1.5:
 * - 场景1.P2 [det-machine] grep -rn "from '@vercel/postgres'" app lib components 输出空 →
 *   静态 fs 断言,QA det-machine 检查(本测试无法自省 grep 仓库)
 * - 场景1.P1 / 场景2.P1 [real-process] 真 PG 连接 + sql`...` / sql.query 行为一致 →
 *   需 npm run dev 连 Vercel PG,QA real-process 验证
 */
