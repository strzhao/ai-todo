export interface UrlMeta {
  title: string | null;
}

const cache = new Map<string, Promise<UrlMeta>>();
const EMPTY: UrlMeta = { title: null };

export function fetchUrlMeta(url: string): Promise<UrlMeta> {
  const existing = cache.get(url);
  if (existing) return existing;

  const promise = fetch(`/api/url-meta?url=${encodeURIComponent(url)}`)
    .then((r) => (r.ok ? r.json() : EMPTY))
    .then((meta: UrlMeta) => {
      if (!meta.title) cache.delete(url); // don't cache failures, allow retry
      return meta;
    })
    .catch(() => {
      cache.delete(url);
      return EMPTY;
    });

  cache.set(url, promise);
  return promise;
}
