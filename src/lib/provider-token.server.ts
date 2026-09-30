/**
 * Shared provider token minting. Tokens are cached in memory and in the edge
 * Cache API (shared across worker isolates), so production does not hammer the
 * token endpoint and trip its rate limit (HTTP 429).
 */
export type TokenBundle = { accessToken: string; token: string; refreshToken: string; fetchedAt: number };

const TTL_MS = 8 * 60 * 1000;
const CACHE_KEY = "https://provider-token.internal/v1";
let memory: TokenBundle | null = null;
let pending: Promise<TokenBundle> | null = null;

function edgeCache(): Cache | null {
  try {
    const c = (globalThis as unknown as { caches?: { default?: Cache } }).caches;
    return c?.default ?? null;
  } catch {
    return null;
  }
}

async function readShared(): Promise<TokenBundle | null> {
  const cache = edgeCache();
  if (!cache) return null;
  try {
    const hit = await cache.match(CACHE_KEY);
    if (!hit) return null;
    const bundle = (await hit.json()) as TokenBundle;
    return Date.now() - bundle.fetchedAt < TTL_MS ? bundle : null;
  } catch {
    return null;
  }
}

async function writeShared(bundle: TokenBundle) {
  const cache = edgeCache();
  if (!cache) return;
  try {
    await cache.put(
      CACHE_KEY,
      new Response(JSON.stringify(bundle), {
        headers: { "content-type": "application/json", "cache-control": `max-age=${TTL_MS / 1000}` },
      }),
    );
  } catch {
    /* cache unavailable */
  }
}

async function mint(endpoint: string, headers: Record<string, string>): Promise<TokenBundle> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt) {
      await new Promise((r) => setTimeout(r, Math.min(600 * 2 ** (attempt - 1), 4000) + Math.random() * 300));
    }
    let response: Response;
    try {
      response = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}_t=${Date.now()}`, {
        headers,
        cache: "no-store",
      });
    } catch {
      lastStatus = 502;
      continue;
    }
    lastStatus = response.status;
    if (response.ok) {
      const body = (await response.json()) as { access_token?: string; token?: string; refresh_token?: string };
      if (!body.access_token) throw new Error("Token service returned no access token");
      return {
        accessToken: body.access_token,
        token: body.token ?? "",
        refreshToken: body.refresh_token ?? "",
        fetchedAt: Date.now(),
      };
    }
    if (response.status !== 429 && response.status < 500) break;
    // Another isolate may have minted a token while we waited.
    const shared = await readShared();
    if (shared) return shared;
  }
  throw new Error(`Token service returned ${lastStatus}`);
}

export async function getProviderToken(endpoint: string, headers: Record<string, string>, force = false) {
  if (!force) {
    if (memory && Date.now() - memory.fetchedAt < TTL_MS) return memory;
    const shared = await readShared();
    if (shared) {
      memory = shared;
      return shared;
    }
  }
  if (!pending) {
    pending = mint(endpoint, headers)
      .then(async (bundle) => {
        memory = bundle;
        await writeShared(bundle);
        return bundle;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}
