import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { VideoPlayer } from "@/components/video-player";
import type { VideoFormat } from "@/lib/video-source";
import logoAsset from "@/assets/logo.png.asset.json";

const search = z.object({
  v: z.string().max(4000).optional(),
  format: z.enum(["hls", "dash", "mp4"]).optional(),
  poster: z.string().max(2000).optional(),
  autoplay: z.coerce.boolean().optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Stream Player — play any video route" },
      { name: "description", content: "Embeddable video player that receives a video route and streams it securely from your API." },
      { property: "og:title", content: "Stream Player" },
      { property: "og:description", content: "Embeddable video player that streams HLS, DASH and MP4 from your API." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlayerPage,
});

function PlayerPage() {
  const params = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const [src, setSrc] = useState<{ route: string; format?: VideoFormat | undefined; poster?: string | undefined } | null>(
    params.v ? { route: params.v, format: params.format, poster: params.poster } : null,
  );
  const [draft, setDraft] = useState(params.v ?? "");

  useEffect(() => {
    if (params.v) setSrc({ route: params.v, format: params.format, poster: params.poster });
  }, [params.v, params.format, params.poster]);

  // Parent site can drive the player: iframe.contentWindow.postMessage({ type: "play", route: "/videos/1.m3u8" }, "*")
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (d && d.type === "play" && typeof d.route === "string" && d.route.length < 4000) {
        setSrc({ route: d.route, format: d.format, poster: d.poster });
      }
    };
    window.addEventListener("message", onMsg);
    window.parent?.postMessage({ type: "player-ready" }, "*");
    return () => window.removeEventListener("message", onMsg);
  }, []);

  if (src) {
    return (
      <main className="grid min-h-screen place-items-center bg-player">
        <div className="w-full max-w-[min(100vw,177vh)]">
          <VideoPlayer route={src.route} format={src.format} poster={src.poster} autoPlay={params.autoplay} />
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <img src={logoAsset.url} alt="Logo" className="w-full max-w-sm object-contain" />
    </main>
  );
}
