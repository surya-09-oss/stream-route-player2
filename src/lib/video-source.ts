export type VideoFormat = "hls" | "dash" | "mp4";

export function detectFormat(route: string, hint?: string | null): VideoFormat {
  if (hint === "hls" || hint === "dash" || hint === "mp4") return hint;
  const path = (route.split("?")[0] ?? "").toLowerCase();
  // Some providers return signed HLS manifests with a .docx suffix.
  if (path.endsWith(".m3u8") || path.endsWith(".docx")) return "hls";
  if (path.endsWith(".mpd")) return "dash";
  return "mp4";
}

/** Every route is played through the same-origin proxy, which adds token + headers. */
export function playbackUrl(route: string) {
  return `/api/public/stream?p=${encodeURIComponent(route)}`;
}
