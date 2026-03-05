import { describe, expect, it } from "vitest";
import { normalizeAccessTokenTtl, THIRTY_DAYS_SECONDS } from "@/lib/auth-cookie";

describe("normalizeAccessTokenTtl", () => {
  it("uses 30 days when expiresIn is missing", () => {
    expect(normalizeAccessTokenTtl(undefined)).toBe(THIRTY_DAYS_SECONDS);
  });

  it("keeps minimum ttl as 60 seconds", () => {
    expect(normalizeAccessTokenTtl(1)).toBe(60);
  });

  it("caps ttl at 30 days", () => {
    expect(normalizeAccessTokenTtl(THIRTY_DAYS_SECONDS + 1)).toBe(THIRTY_DAYS_SECONDS);
  });

  it("uses rounded integer when value is in range", () => {
    expect(normalizeAccessTokenTtl(123.9)).toBe(123);
  });
});
