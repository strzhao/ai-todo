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

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const raw = decodeEntities(match[1]).replace(/\s+/g, " ").trim();
  return raw || null;
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
    const title = extractTitle(html);

    return NextResponse.json(
      { title },
      { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } }
    );
  } catch {
    return empty;
  }
}
