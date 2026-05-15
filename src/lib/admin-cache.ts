const DEFAULT_TTL_MS = 5 * 60_000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type CacheReadResult<T> = {
  value: T;
  cacheHit: boolean;
};

const cache = new Map<string, CacheEntry<unknown>>();

export async function readAdminCache<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS
): Promise<CacheReadResult<T>> {
  const now = Date.now();
  const cached = cache.get(key) as CacheEntry<T> | undefined;

  if (cached && cached.expiresAt > now) {
    return {
      value: cached.value,
      cacheHit: true,
    };
  }

  const value = await loader();
  cache.set(key, {
    value,
    expiresAt: now + ttlMs,
  });

  return {
    value,
    cacheHit: false,
  };
}

export function invalidateAdminCache(...prefixes: string[]) {
  cache.forEach((_, key) => {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      cache.delete(key);
    }
  });
}

export function clearAdminCache() {
  cache.clear();
}
