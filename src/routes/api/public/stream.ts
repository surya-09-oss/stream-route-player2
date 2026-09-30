import { createFileRoute } from "@tanstack/react-router";

/**
 * Same-origin video proxy. The site sends only a video route (e.g. "/videos/42/master.m3u8");
 * this handler adds the secret token + headers server-side, streams bytes back with
 * Range support, and rewrites HLS playlists so every segment/key also flows through here.
 * Only hosts from VIDEO_API_BASE_URL / VIDEO_ALLOWED_HOSTS are reachable (not an open proxy).
 */

function config() {
  const clean = (value: string | undefined) => (value ?? "").trim().replace(/^['"]|['"]$/g, "");
  const base = clean(process.env["VIDEO_API_BASE_URL"]);
  const tokenEndpoint = clean(process.env["VIDEO_TOKEN_ENDPOINT"]);
  const token = clean(process.env["VIDEO_API_TOKEN"]);
  let extra: Record<string, string> = {};
  try {
    extra = JSON.parse(process.env["VIDEO_API_HEADERS"] ?? "{}");
  } catch {
    extra = {};
  }
  const hosts = new Set<string>();
  for (const rawHost of (process.env["VIDEO_ALLOWED_HOSTS"] ?? "").split(",")) {
    const entry = clean(rawHost).replace(/^\*\./, "");
    if (!entry) continue;
    try {
      hosts.add(new URL(entry.includes("://") ? entry : `https://${entry}`).hostname.toLowerCase());
    } catch {
      /* ignore malformed allow-list entries */
    }
  }
  if (base) {
    try {
      hosts.add(new URL(base).host.toLowerCase());
    } catch {
      /* invalid base */
    }
  }
  return { base, tokenEndpoint, token, extra, hosts };
}

async function generatedToken(endpoint: string, headers: Record<string, string>, force = false) {
  const { getProviderToken } = await import("@/lib/provider-token.server");
  return getProviderToken(endpoint, headers, force);
}

/** Provider credentials are only needed by the API host; signed CDN URLs carry their own auth. */
function needsProviderAuth(target: URL, base: string) {
  try {
    return target.host.toLowerCase() === new URL(base).host.toLowerCase();
  } catch {
    return false;
  }
}

function hostAllowed(hostname: string, allowed: Set<string>) {
  const host = hostname.toLowerCase();
  return [...allowed].some((entry) => host === entry || host.endsWith(`.${entry}`));
}

function resolveTarget(route: string, base: string) {
  // Resolve an absolute signed URL independently. A malformed base setting must
  // not break otherwise valid absolute lecture URLs.
  try {
    return new URL(route);
  } catch {
    if (!base) return null;
  }

  try {
    return new URL(route, base.endsWith("/") ? base : `${base}/`);
  } catch {
    return null;
  }
}

async function requestHeaders(
  extra: Record<string, string>,
  tokenEndpoint: string,
  staticToken: string,
  force = false,
) {
  const headers = { ...extra };
  if (tokenEndpoint) {
    const bundle = await generatedToken(tokenEndpoint, extra, force);
    headers["Authorization"] = `Bearer ${bundle.accessToken}`;
    headers["Cookie"] = `auth_token=${bundle.token}; api_barear_access_token=${bundle.accessToken}`;
    headers["randomid"] = crypto.randomUUID();
    if (bundle.refreshToken) headers["x-refresh-token"] = bundle.refreshToken;
  } else if (staticToken) {
    headers["Authorization"] = `Bearer ${staticToken}`;
  }
  return headers;
}

const proxied = (abs: string) => `/api/public/stream?p=${encodeURIComponent(abs)}`;

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const headers = new Headers();
  headers.set("access-control-allow-origin", origin || "*");
  headers.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
  headers.set("access-control-allow-headers", "range, content-type");
  headers.set("access-control-expose-headers", "content-length, content-range, accept-ranges");
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "origin");
  return headers;
}

function responseWithCors(request: Request, body: BodyInit | null, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  corsHeaders(request).forEach((value, key) => headers.set(key, value));
  return new Response(body, { ...init, headers });
}

function rewritePlaylist(text: string, playlistUrl: string) {
  return text
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${proxied(new URL(u, playlistUrl).href)}"`);
      }
      return proxied(new URL(t, playlistUrl).href);
    })
    .join("\n");
}

export const Route = createFileRoute("/api/public/stream")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => responseWithCors(request, null, { status: 204 }),
      HEAD: async ({ request }) => handleStream(request),
      GET: async ({ request }) => {
        return handleStream(request);
      },
    },
  },
});

async function handleStream(request: Request) {
        const { base, tokenEndpoint, token, extra, hosts } = config();
        const p = new URL(request.url).searchParams.get("p");
        if (!p || p.length > 4000) return responseWithCors(request, "Missing video route", { status: 400 });

        const target = resolveTarget(p, base);
        if (!target) return responseWithCors(request, "Invalid video route or API base URL", { status: 400 });
        if (!/^https?:$/.test(target.protocol) || !hostAllowed(target.hostname, hosts)) {
          return responseWithCors(request, "Host not allowed", { status: 403 });
        }

        try {
          const withAuth = needsProviderAuth(target, base);
          const range = request.headers.get("range");
          const build = async (force: boolean) => {
            const h: Record<string, string> = withAuth ? await requestHeaders(extra, tokenEndpoint, token, force) : {};
            if (range) h["Range"] = range;
            return h;
          };
          let headers = await build(false);

          let upstream: Response | undefined;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            if (attempt) {
              await new Promise((resolve) => setTimeout(resolve, attempt * 300));
              const rejected = upstream?.status === 401 || upstream?.status === 403;
              headers = await build(withAuth && rejected);
            }
            try {
              upstream = await fetch(target.href, { headers, redirect: "manual" });
              if (upstream.ok || (upstream.status < 500 && upstream.status !== 401 && upstream.status !== 403 && upstream.status !== 429)) break;
            } catch {
              upstream = undefined;
            }
          }
          if (!upstream) return responseWithCors(request, "Video service unavailable", { status: 502 });

          let resolvedUrl = target;
          for (let redirects = 0; redirects < 5 && upstream.status >= 300 && upstream.status < 400; redirects += 1) {
            const location = upstream.headers.get("location");
            if (!location) break;
            const previousOrigin = resolvedUrl.origin;
            resolvedUrl = new URL(location, resolvedUrl);
            if (!/^https?:$/.test(resolvedUrl.protocol) || !hostAllowed(resolvedUrl.hostname, hosts)) {
              return responseWithCors(request, "Redirect host not allowed", { status: 403 });
            }
            // Signed CDN URLs carry their authorization in the URL. Forwarding the
            // API bearer token or session cookie to another origin can make the CDN
            // reject an otherwise valid signature, especially on deployed workers.
            const redirectHeaders = resolvedUrl.origin === previousOrigin
              ? headers
              : range ? { Range: range } : {};
            upstream = await fetch(resolvedUrl, { headers: redirectHeaders, redirect: "manual" });
          }
          const type = upstream.headers.get("content-type") ?? "";
          // This provider intentionally serves some signed HLS manifests with a
          // .docx suffix, so treat both suffixes as playlists before streaming.
          const isPlaylist = /mpegurl/i.test(type) || /\.(m3u8|docx)$/i.test(resolvedUrl.pathname);

          if (isPlaylist && upstream.ok) {
            const body = rewritePlaylist(await upstream.text(), resolvedUrl.href);
            return responseWithCors(request, request.method === "HEAD" ? null : body, {
              status: upstream.status,
              headers: { "content-type": "application/vnd.apple.mpegurl", "cache-control": "no-store" },
            });
          }

          const out = new Headers();
          for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"]) {
            const v = upstream.headers.get(h);
            if (v) out.set(h, v);
          }
          out.set("cache-control", isPlaylist ? "no-store" : "public, max-age=300, stale-while-revalidate=60");
          return responseWithCors(request, request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers: out });
        } catch (error) {
          console.error("Video upstream request failed", error instanceof Error ? error.message : "Unknown error");
          return responseWithCors(request, "Video service unavailable", { status: 502 });
        }
}
