import { describe, it, expect } from "vitest";
import { normalizeNextPath, buildCallbackUrl, buildAuthorizeUrl } from "@/lib/auth-config";

describe("normalizeNextPath", () => {
  it("returns '/' for null", () => {
    expect(normalizeNextPath(null)).toBe("/");
  });

  it("returns '/' for undefined", () => {
    expect(normalizeNextPath(undefined)).toBe("/");
  });

  it("returns '/' for empty string", () => {
    expect(normalizeNextPath("")).toBe("/");
  });

  it("returns '/' for paths not starting with /", () => {
    expect(normalizeNextPath("foo/bar")).toBe("/");
  });

  it("returns '/' for double-slash paths (open redirect prevention)", () => {
    expect(normalizeNextPath("//evil.com")).toBe("/");
  });

  it("returns valid path as-is", () => {
    expect(normalizeNextPath("/spaces/abc")).toBe("/spaces/abc");
  });

  it("returns root path as-is", () => {
    expect(normalizeNextPath("/")).toBe("/");
  });
});

describe("buildCallbackUrl", () => {
  it("builds callback URL without next param for root", () => {
    const url = buildCallbackUrl("/");
    expect(url).toContain("/auth/callback");
    expect(url).not.toContain("next=");
  });

  it("builds callback URL without next param when undefined", () => {
    const url = buildCallbackUrl();
    expect(url).toContain("/auth/callback");
    expect(url).not.toContain("next=");
  });

  it("includes next param for non-root paths", () => {
    const url = buildCallbackUrl("/spaces/abc");
    expect(url).toContain("/auth/callback");
    expect(url).toContain("next=");
    expect(url).toContain("spaces");
  });
});

describe("buildAuthorizeUrl", () => {
  it("builds authorize URL with required params", () => {
    const url = buildAuthorizeUrl("https://example.com/callback", "state123");
    expect(url).toContain("/authorize");
    expect(url).toContain("service=");
    expect(url).toContain("return_to=");
    expect(url).toContain("state=state123");
  });

  it("includes prompt param when select_account", () => {
    const url = buildAuthorizeUrl("https://example.com/callback", "state123", "select_account");
    expect(url).toContain("prompt=select_account");
  });

  it("omits prompt param for other values", () => {
    const url = buildAuthorizeUrl("https://example.com/callback", "state123", "login");
    expect(url).not.toContain("prompt=");
  });
});
