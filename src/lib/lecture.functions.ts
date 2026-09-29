import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const lectureIds = z.object({
  batchId: z.string().min(6).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  subjectId: z.string().min(6).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  topicId: z.string().min(6).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  lectureId: z.string().min(6).max(64).regex(/^[a-zA-Z0-9_-]+$/),
});

type TokenBundle = { accessToken: string; token: string; refreshToken: string; fetchedAt: number };
let cachedToken: TokenBundle | null = null;
let pendingToken: Promise<TokenBundle> | null = null;

function clean(value: string | undefined) {
  return (value ?? "").trim().replace(/^['"]|['"]$/g, "");
}

function config() {
  const apiBase = clean(process.env["VIDEO_API_BASE_URL"]);
  const playerBase = clean(process.env["VIDEO_PLAYER_BASE_URL"]);
  const tokenEndpoint = clean(process.env["VIDEO_TOKEN_ENDPOINT"]);
  let extraHeaders: Record<string, string> = {};
  try {
    extraHeaders = JSON.parse(process.env["VIDEO_API_HEADERS"] ?? "{}");
  } catch {
    extraHeaders = {};
  }
  if (!apiBase || !playerBase || !tokenEndpoint) throw new Error("Video service is not configured");
  return { apiBase: apiBase.replace(/\/$/, ""), playerBase: playerBase.replace(/\/$/, ""), tokenEndpoint, extraHeaders };
}

async function token(endpoint: string, headers: Record<string, string>, force = false) {
  if (!force && cachedToken && Date.now() - cachedToken.fetchedAt < 8 * 60 * 1000) return cachedToken;
  if (!pendingToken) {
    pendingToken = fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}_t=${Date.now()}`, {
      headers,
      cache: "no-store",
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Token service returned ${response.status}`);
      const body = await response.json() as { access_token?: string; token?: string; refresh_token?: string };
      if (!body.access_token) throw new Error("Token service returned no access token");
      cachedToken = {
        accessToken: body.access_token,
        token: body.token ?? "",
        refreshToken: body.refresh_token ?? "",
        fetchedAt: Date.now(),
      };
      return cachedToken;
    }).finally(() => { pendingToken = null; });
  }
  return pendingToken;
}

async function providerHeaders(force = false) {
  const { tokenEndpoint, extraHeaders } = config();
  const bundle = await token(tokenEndpoint, extraHeaders, force);
  return {
    ...extraHeaders,
    authorization: `Bearer ${bundle.accessToken}`,
    cookie: `auth_token=${bundle.token}; api_barear_access_token=${bundle.accessToken}`,
    randomid: crypto.randomUUID(),
    ...(bundle.refreshToken ? { "x-refresh-token": bundle.refreshToken } : {}),
  };
}

async function apiGet(path: string) {
  const { apiBase } = config();
  let lastStatus = 502;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, attempt * 350));
    const response = await fetch(`${apiBase}${path}`, { headers: await providerHeaders(attempt > 0), cache: "no-store" });
    lastStatus = response.status;
    if (response.ok) {
      const body = await response.json() as { data?: unknown } & Record<string, unknown>;
      return (body.data ?? body) as Record<string, unknown>;
    }
    if (response.status < 500 && response.status !== 429 && response.status !== 401 && response.status !== 403) break;
  }
  throw new Error(`Lecture service returned ${lastStatus}`);
}

function hidden(html: string, id: string) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`id=["']${escaped}["'][^>]*value=["']([^"']*)["']`, "i"),
    new RegExp(`value=["']([^"']*)["'][^>]*id=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return match[1];
  }
  return "";
}

async function decrypt(value: string, keyValue: string, ivValue: string) {
  if (!value) return "";
  try {
    const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(keyValue), "AES-CBC", false, ["decrypt"]);
    const clear = await crypto.subtle.decrypt({ name: "AES-CBC", iv: encoder.encode(ivValue) }, key, bytes);
    return new TextDecoder().decode(clear).trim();
  } catch {
    return "";
  }
}

function videoDetailsFrom(row: Record<string, unknown>) {
  return (row["videoDetails"] as Record<string, unknown> | undefined) ?? {};
}

export const resolveLecture = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => lectureIds.parse(input))
  .handler(async ({ data }) => {
    const { playerBase } = config();
    const streamKey = clean(process.env["VIDEO_STREAM_KEY"]);
    const streamIv = clean(process.env["VIDEO_STREAM_IV"]);
    if (streamKey.length !== 16 || streamIv.length !== 16) throw new Error("Video decryption is not configured");
    const detail = await apiGet(
      `/v1/batches/${data.batchId}/subject/${data.subjectId}/schedule/${data.lectureId}/schedule-details`,
    );
    const video = videoDetailsFrom(detail);
    const title = String(video["name"] ?? detail["topic"] ?? "Lecture");
    const typeId = String(video["_id"] ?? data.lectureId);
    const sourceUrl = String(video["videoUrl"] ?? video["embedCode"] ?? detail["url"] ?? "");
    const image = String(video["image"] ?? video["thumbnail"] ?? detail["image"] ?? "");
    const params = new URLSearchParams({
      batch_id: data.batchId,
      subject_id: data.subjectId,
      topic_id: data.topicId,
      video_id: data.lectureId,
      typeId,
      video_name: title,
      video_img: image,
      video_url: sourceUrl,
      video_type: "new",
      play_type: "Lecture",
    });
    const fetchPlayer = async (force = false) => fetch(`${playerBase}/play.php?${params.toString()}`, {
      headers: { ...(await providerHeaders(force)), accept: "text/html,application/xhtml+xml", referer: `${playerBase}/`, origin: playerBase },
      cache: "no-store",
    });
    let response = await fetchPlayer();
    if (response.status === 401 || response.status === 403) response = await fetchPlayer(true);
    if (!response.ok) throw new Error(`Player service returned ${response.status}`);
    const html = await response.text();
    const route = await decrypt(hidden(html, "enc_video_url"), streamKey, streamIv);
    if (!route) throw new Error("This lecture has no playable stream");
    const path = (route.split("?")[0] ?? "").toLowerCase();
    const format = path.endsWith(".m3u8") || path.endsWith(".docx") ? "hls" : path.endsWith(".mpd") ? "dash" : "mp4";
    return { route, format: format as "hls" | "dash" | "mp4", title, image };
  });