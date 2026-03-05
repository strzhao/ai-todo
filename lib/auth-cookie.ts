export const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

export function normalizeAccessTokenTtl(expiresIn: unknown): number {
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn)) {
    return THIRTY_DAYS_SECONDS;
  }

  const rounded = Math.floor(expiresIn);
  if (rounded < 60) return 60;
  if (rounded > THIRTY_DAYS_SECONDS) return THIRTY_DAYS_SECONDS;
  return rounded;
}
