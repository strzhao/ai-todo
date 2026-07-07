import { NextRequest, NextResponse } from "next/server";

function sanitizeMetricName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "metric";
}

function round(ms: number): number {
  return Number(ms.toFixed(1));
}

export class RouteTimer {
  private readonly startedAt = performance.now();
  private readonly segments = new Map<string, number>();
  private readonly debugEnabled: boolean;
  private readonly logEnabled: boolean;
  private readonly path: string;
  private readonly method: string;
  readonly requestId: string;

  constructor(req: NextRequest) {
    this.debugEnabled = req.headers.get("x-debug-rt") === "1";
    this.logEnabled = process.env.ENABLE_RT_LOGS === "true";
    this.path = req.nextUrl.pathname;
    this.method = req.method;
    this.requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  }

  add(metric: string, ms: number) {
    if (!Number.isFinite(ms) || ms < 0) return;
    const key = sanitizeMetricName(metric);
    const prev = this.segments.get(key) ?? 0;
    this.segments.set(key, prev + ms);
  }

  async track<T>(metric: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      this.add(metric, performance.now() - start);
    }
  }

  finish(res: NextResponse): NextResponse {
    if (!this.segments.has("db_init")) {
      this.segments.set("db_init", 0);
    }
    this.add("total", performance.now() - this.startedAt);

    const serverTiming = [...this.segments.entries()]
      .map(([name, ms]) => `${name};dur=${round(ms)}`)
      .join(", ");

    if (serverTiming) {
      res.headers.set("Server-Timing", serverTiming);
    }

    res.headers.set("x-request-id", this.requestId);

    if (this.debugEnabled) {
      const breakdown = Object.fromEntries(
        [...this.segments.entries()].map(([name, ms]) => [name, round(ms)])
      );
      res.headers.set("x-rt-breakdown", JSON.stringify(breakdown));
    }

    if (this.logEnabled) {
      const timings = Object.fromEntries(
        [...this.segments.entries()].map(([name, ms]) => [name, round(ms)])
      );
      const payload = {
        type: "route_timing",
        request_id: this.requestId,
        method: this.method,
        path: this.path,
        status: res.status,
        region: process.env.VERCEL_REGION ?? "local",
        timings,
      };
      console.info(`[rt] ${JSON.stringify(payload)}`);
    }

    return res;
  }

  json(body: unknown, init?: ResponseInit): NextResponse {
    return this.finish(NextResponse.json(body, init));
  }

  empty(status = 204): NextResponse {
    return this.finish(new NextResponse(null, { status }));
  }
}

export function createRouteTimer(req: NextRequest): RouteTimer {
  return new RouteTimer(req);
}
