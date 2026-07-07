import pg from "pg";

/**
 * pg 兼容层:对齐 @vercel/postgres 的 `sql` 双形态调用约定。
 *
 * - `sql\`...\`` tagged template(占位符 $1,$2,...)
 * - `sql.query(text, params)` 直接参数化查询(支持 TEXT[] 数组字段 + 动态拼接)
 *
 * 返回 pg.QueryResult(rows / rowCount / command),业务代码只依赖这三个字段。
 * 对齐测试 mock 形状 `Object.assign(vi.fn(), { query: vi.fn() })`。
 */
const pool = new pg.Pool({
  connectionString: process.env.POSTGRES_URL,
  max: 5, // 对齐 VPS 2G 内存预算,小池避免连接爆
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

function taggedSql(strings: TemplateStringsArray, ...values: unknown[]) {
  let text = "";
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < values.length) text += `$${i + 1}`;
  }
  return pool.query(text, values);
}

export const sql = Object.assign(taggedSql, {
  query: (text: string, params?: unknown[]) => pool.query(text, params),
});

export { pool };
