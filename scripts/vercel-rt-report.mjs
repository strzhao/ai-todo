import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const parsed = {
    since: "2h",
    limit: 2000,
    environment: "production",
    project: "",
    apiOnly: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--since" && argv[i + 1]) {
      parsed.since = argv[++i];
      continue;
    }
    if (arg === "--limit" && argv[i + 1]) {
      parsed.limit = Number(argv[++i]) || parsed.limit;
      continue;
    }
    if (arg === "--environment" && argv[i + 1]) {
      parsed.environment = argv[++i];
      continue;
    }
    if (arg === "--project" && argv[i + 1]) {
      parsed.project = argv[++i];
      continue;
    }
    if (arg === "--all-paths") {
      parsed.apiOnly = false;
      continue;
    }
  }

  return parsed;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  const pos = Math.max(0, Math.min(sorted.length - 1, index));
  return sorted[pos];
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function fmtMs(v) {
  if (v == null || !Number.isFinite(v)) return "-";
  return v.toFixed(1);
}

function fmtPct(v) {
  if (v == null || !Number.isFinite(v)) return "-";
  return `${(v * 100).toFixed(1)}%`;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function table(rows) {
  if (!rows.length) return "";
  const widths = rows[0].map((_, col) =>
    Math.max(...rows.map((r) => String(r[col]).length))
  );
  return rows
    .map((r, rowIndex) =>
      r
        .map((cell, col) => {
          const raw = String(cell);
          const pad = widths[col] - raw.length;
          const spacer = " ".repeat(pad);
          if (rowIndex === 0 || col === 0) return raw + spacer;
          return spacer + raw;
        })
        .join("  ")
    )
    .join("\n");
}

function normalizePath(pathname, apiOnly) {
  if (typeof pathname !== "string" || !pathname) return null;
  if (!apiOnly) return pathname;
  if (!pathname.startsWith("/api/")) return null;
  return pathname;
}

function getOrCreate(map, key, create) {
  let value = map.get(key);
  if (!value) {
    value = create();
    map.set(key, value);
  }
  return value;
}

function parseRtMessage(message) {
  if (typeof message !== "string") return null;
  if (!message.startsWith("[rt] ")) return null;
  const raw = message.slice(5).trim();
  try {
    const payload = JSON.parse(raw);
    if (payload?.type !== "route_timing") return null;
    return payload;
  } catch {
    return null;
  }
}

function collect(logLines, apiOnly) {
  const requestStats = new Map();
  const rtStats = new Map();
  let requestLineCount = 0;
  let rtLineCount = 0;

  for (const line of logLines) {
    if (!line) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    const reqPath = normalizePath(event.requestPath, apiOnly);
    if (reqPath) {
      requestLineCount += 1;
      const pathStats = getOrCreate(requestStats, reqPath, () => ({
        total: 0,
        error: 0,
      }));
      pathStats.total += 1;
      const statusCode = toNumber(event.responseStatusCode);
      if (statusCode != null && statusCode >= 400) {
        pathStats.error += 1;
      }
    }

    const rtPayload = parseRtMessage(event.message);
    if (!rtPayload) continue;

    const path = normalizePath(rtPayload.path, apiOnly);
    if (!path) continue;
    const timings = rtPayload.timings && typeof rtPayload.timings === "object"
      ? rtPayload.timings
      : null;
    if (!timings) continue;

    rtLineCount += 1;
    const pathRt = getOrCreate(rtStats, path, () => ({
      count: 0,
      total: [],
      segments: new Map(),
      statuses: new Map(),
    }));

    pathRt.count += 1;
    const totalMs = toNumber(timings.total);
    if (totalMs != null) {
      pathRt.total.push(totalMs);
    }

    for (const [name, value] of Object.entries(timings)) {
      const v = toNumber(value);
      if (v == null) continue;
      const seg = getOrCreate(pathRt.segments, name, () => []);
      seg.push(v);
    }

    const status = toNumber(rtPayload.status);
    if (status != null) {
      const prev = pathRt.statuses.get(status) ?? 0;
      pathRt.statuses.set(status, prev + 1);
    }
  }

  return { requestStats, rtStats, requestLineCount, rtLineCount };
}

function buildApiSummary(requestStats, rtStats) {
  const paths = new Set([...requestStats.keys(), ...rtStats.keys()]);
  const rows = [];

  for (const path of paths) {
    const req = requestStats.get(path) ?? { total: 0, error: 0 };
    const rt = rtStats.get(path);
    const totals = rt?.total ?? [];
    const p50 = percentile(totals, 50);
    const p95 = percentile(totals, 95);
    const errRate = req.total > 0 ? req.error / req.total : null;

    rows.push({
      path,
      count: req.total,
      rtCount: rt?.count ?? 0,
      p50,
      p95,
      errRate,
    });
  }

  rows.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
  return rows;
}

function buildBottleneckSummary(rtStats) {
  const rows = [];
  for (const [path, stat] of rtStats.entries()) {
    if (!stat.total.length) continue;
    const avgTotal = avg(stat.total);
    if (avgTotal <= 0) continue;

    let topSegment = null;
    let topShare = 0;
    for (const [segment, values] of stat.segments.entries()) {
      if (segment === "total" || !values.length) continue;
      const share = avg(values) / avgTotal;
      if (share > topShare) {
        topShare = share;
        topSegment = segment;
      }
    }

    rows.push({
      path,
      topSegment: topSegment ?? "-",
      topShare,
      avgTotal,
      p95Total: percentile(stat.total, 95),
    });
  }

  rows.sort((a, b) => b.topShare - a.topShare || b.avgTotal - a.avgTotal);
  return rows;
}

function fetchLogs(options) {
  const args = [
    "logs",
    "--environment",
    options.environment,
    "--since",
    options.since,
    "--limit",
    String(options.limit),
    "--no-follow",
    "--no-branch",
    "--json",
  ];
  if (options.project) {
    args.push("--project", options.project);
  }

  const cmd = `vercel ${args.join(" ")}`;
  const result = spawnSync("vercel", args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
  });

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`执行失败: ${cmd}\n${detail}`);
  }

  return (result.stdout || "").split(/\r?\n/);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const lines = fetchLogs(options);
  const { requestStats, rtStats, requestLineCount, rtLineCount } = collect(lines, options.apiOnly);

  const apiSummary = buildApiSummary(requestStats, rtStats);
  const bottleneckSummary = buildBottleneckSummary(rtStats);

  console.log("Vercel 接口性能报告");
  console.log(`- 窗口: since=${options.since}, environment=${options.environment}, limit=${options.limit}`);
  console.log(`- 统计路径: ${options.apiOnly ? "仅 /api/*" : "全部路径"}`);
  console.log(`- 请求日志条数: ${requestLineCount}`);
  console.log(`- RT日志条数: ${rtLineCount}`);
  if (requestLineCount > 0) {
    console.log(`- RT覆盖率: ${fmtPct(rtLineCount / requestLineCount)}`);
  }
  console.log("");

  if (!apiSummary.length) {
    console.log("未匹配到接口日志。");
    return;
  }

  const apiTable = table([
    ["Path", "Req", "RT", "P50 Total(ms)", "P95 Total(ms)", "Error Rate"],
    ...apiSummary.map((r) => [
      r.path,
      String(r.count),
      String(r.rtCount),
      fmtMs(r.p50),
      fmtMs(r.p95),
      fmtPct(r.errRate),
    ]),
  ]);
  console.log("接口汇总");
  console.log(apiTable);
  console.log("");

  if (!bottleneckSummary.length) {
    console.log("未发现可计算的 RT 分段日志。");
    console.log("请在 Vercel 环境变量中设置 ENABLE_RT_LOGS=true 并重新部署后再采样。");
    return;
  }

  const bottleneckTable = table([
    ["Path", "Top Segment", "Top Share", "Avg Total(ms)", "P95 Total(ms)"],
    ...bottleneckSummary.map((r) => [
      r.path,
      r.topSegment,
      fmtPct(r.topShare),
      fmtMs(r.avgTotal),
      fmtMs(r.p95Total),
    ]),
  ]);
  console.log("瓶颈占比");
  console.log(bottleneckTable);
}

main();
