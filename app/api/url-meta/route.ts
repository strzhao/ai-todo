import { NextRequest, NextResponse } from "next/server";

export const preferredRegion = "hkg1";

const TIMEOUT_MS = 5000;
const MAX_BYTES = 50 * 1024; // only read first 50KB

// Block private/reserved IPs to prevent SSRF
function isPrivateUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.") ||
      hostname.endsWith(".local") ||
      hostname === "[::1]"
    ) {
      return true;
    }
  } catch {
    return true;
  }
  return false;
}

function decodeEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractMeta(html: string, attr: string): string | null {
  // Match <meta property="og:title" content="..."> or <meta name="title" content="...">
  const re = new RegExp(`<meta\\s+(?:[^>]*?(?:property|name)=["']${attr}["'][^>]*?content=["']([^"']*?)["']|[^>]*?content=["']([^"']*?)["'][^>]*?(?:property|name)=["']${attr}["'])`, "i");
  const m = html.match(re);
  if (!m) return null;
  const raw = decodeEntities(m[1] || m[2]).replace(/\s+/g, " ").trim();
  return raw || null;
}

function extractTitle(html: string): string | null {
  // 1. <title> tag
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const raw = decodeEntities(titleMatch[1]).replace(/\s+/g, " ").trim();
    if (raw) return raw;
  }
  // 2. og:title
  const ogTitle = extractMeta(html, "og:title");
  if (ogTitle) return ogTitle;
  // 3. <meta name="title">
  const metaTitle = extractMeta(html, "title");
  if (metaTitle) return metaTitle;
  // 4. <meta name="description"> as last resort (truncated)
  const desc = extractMeta(html, "description");
  if (desc) return desc.length > 80 ? desc.slice(0, 77) + "..." : desc;
  return null;
}

// Generate a readable name from URL when no title is found (SPA pages etc.)
function friendlyName(url: string): string | null {
  try {
    const { hostname, pathname } = new URL(url);
    // Use the domain's readable part (e.g., "docs.popo.netease.com" → "Popo Docs")
    const parts = hostname.replace(/^www\./, "").split(".");
    // Find the meaningful subdomain or domain name
    const meaningful = parts.length >= 3 ? parts.slice(0, -2) : [parts[0]];
    const name = meaningful
      .reverse()
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ");
    // Add path hint if it looks like a doc/page
    const pathParts = pathname.split("/").filter(Boolean);
    const lastSegment = pathParts[pathParts.length - 1];
    if (lastSegment && !/^[a-f0-9]{20,}$/i.test(lastSegment)) {
      // If last path segment is readable (not a hash ID), include it
      const decoded = decodeURIComponent(lastSegment).replace(/[-_]/g, " ");
      return `${name} - ${decoded}`;
    }
    if (pathParts.length > 0) {
      // Include the first path segment as category hint
      const category = decodeURIComponent(pathParts[0]).replace(/[-_]/g, " ");
      return `${name} - ${category}`;
    }
    return name;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const empty = NextResponse.json({ title: null });

  if (!url || !/^https?:\/\//i.test(url) || isPrivateUrl(url)) {
    return empty;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LinkPreview/1.0)",
        Accept: "text/html",
      },
      redirect: "follow",
    });

    clearTimeout(timer);

    if (!res.ok || !res.body) return empty;

    // Stream-read up to MAX_BYTES
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (totalBytes < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      totalBytes += value.length;
    }
    reader.cancel().catch(() => {});

    const decoder = new TextDecoder("utf-8", { fatal: false });
    const html = decoder.decode(Buffer.concat(chunks));
    const title = extractTitle(html) || friendlyName(url);

    return NextResponse.json(
      { title },
      { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } }
    );
  } catch {
    return empty;
  }
}
