import { NextRequest } from "next/server";

const BASE = "http://localhost";

export function makeGET(path: string, params?: Record<string, string>): NextRequest {
  const url = new URL(path, BASE);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url);
}

export function makePOST(path: string, body: unknown): NextRequest {
  return new NextRequest(new URL(path, BASE), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function makePATCH(path: string, body: unknown): NextRequest {
  return new NextRequest(new URL(path, BASE), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function makeDELETE(path: string): NextRequest {
  return new NextRequest(new URL(path, BASE), { method: "DELETE" });
}

export function makeRouteContext<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}
