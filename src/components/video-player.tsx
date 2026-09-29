import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, PictureInPicture2,
  RotateCcw, RotateCw, Loader2, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { detectFormat, playbackUrl, type VideoFormat } from "@/lib/video-source";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function fmt(s: number) {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600), m = Math.floor((s / 60) % 60), sec = Math.floor(s % 60);
  return `${h ? h + ":" : ""}${h ? String(m).padStart(2, "0") : m}:${String(sec).padStart(2, "0")}`;
}

type Level = { id: number; label: string };

export function VideoPlayer({ route, format, poster, autoPlay }: {
  route: string; format?: VideoFormat | null | undefined; poster?: string | null | undefined; autoPlay?: boolean | undefined;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<any>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [levels, setLevels] = useState<Level[]>([]);
  const [level, setLevel] = useState(-1);
  const [menu, setMenu] = useState<null | "speed" | "quality">(null);
  const [fs, setFs] = useState(false);
  const [visible, setVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fmtType = detectFormat(route, format);

  /* ---------- load source ---------- */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    setError(null); setBuffering(true); setLevels([]); setLevel(-1);
    const src = playbackUrl(route);

    (async () => {
      if (fmtType === "hls") {
        if (video.canPlayType("application/vnd.apple.mpegurl") && !(await import("hls.js")).default.isSupported()) {
          video.src = src;
        } else {
          const Hls = (await import("hls.js")).default;
          if (cancelled) return;
          const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
          engineRef.current = hls;
          hls.loadSource(src);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, (_e: unknown, d: any) => {
            setLevels(d.levels.map((l: any, i: number) => ({ id: i, label: l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)}k` })));
          });
          hls.on(Hls.Events.ERROR, (_e: unknown, d: any) => {
            if (!d.fatal) return;
            if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
            else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
            else setError("This video could not be played.");
          });
        }
      } else if (fmtType === "dash") {
        const dashjs = await import("dashjs");
        if (cancelled) return;
        const player = dashjs.MediaPlayer().create();
        engineRef.current = player;
        player.initialize(video, src, !!autoPlay);
        player.on("error", () => setError("This video could not be played."));
      } else {
        video.src = src;
      }
      if (autoPlay) video.play().catch(() => {});
    })().catch(() => setError("Player failed to start."));

    return () => {
      cancelled = true;
      const e = engineRef.current;
      if (e?.destroy) e.destroy();
      else if (e?.reset) e.reset();
      engineRef.current = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [route, fmtType, autoPlay]);

  /* ---------- video events ---------- */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const on = (n: string, f: () => void) => { v.addEventListener(n, f); return () => v.removeEventListener(n, f); };
    const offs = [
      on("play", () => setPlaying(true)),
      on("pause", () => setPlaying(false)),
      on("waiting", () => setBuffering(true)),
      on("playing", () => setBuffering(false)),
      on("canplay", () => setBuffering(false)),
      on("loadedmetadata", () => setDuration(v.duration)),
      on("durationchange", () => setDuration(v.duration)),
      on("timeupdate", () => setCurrent(v.currentTime)),
      on("progress", () => { if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1)); }),
      on("volumechange", () => { setVolume(v.volume); setMuted(v.muted); }),
      on("error", () => { if (fmtType === "mp4") setError("This video could not be played."); }),
    ];
    const fsChange = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", fsChange);
    return () => { offs.forEach((o) => o()); document.removeEventListener("fullscreenchange", fsChange); };
  }, [fmtType]);

  const toggle = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    v.paused ? v.play().catch(() => {}) : v.pause();
  }, []);
  const seekBy = useCallback((d: number) => {
    const v = videoRef.current; if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + d));
  }, []);
  const toggleFs = useCallback(() => {
    document.fullscreenElement ? document.exitFullscreen() : wrapRef.current?.requestFullscreen();
  }, []);

  const poke = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 2800);
  }, []);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const v = videoRef.current; if (!v) return;
      if (e.key === " " || e.key === "k") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowRight" || e.key === "l") seekBy(10);
      else if (e.key === "ArrowLeft" || e.key === "j") seekBy(-10);
      else if (e.key === "ArrowUp") { e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1); }
      else if (e.key === "ArrowDown") { e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1); }
      else if (e.key === "m") v.muted = !v.muted;
      else if (e.key === "f") toggleFs();
      poke();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [toggle, seekBy, toggleFs, poke]);

  const setRate = (r: number) => { if (videoRef.current) videoRef.current.playbackRate = r; setSpeed(r); setMenu(null); };
  const setQuality = (id: number) => { if (engineRef.current && "currentLevel" in engineRef.current) engineRef.current.currentLevel = id; setLevel(id); setMenu(null); };

  const pct = duration ? (current / duration) * 100 : 0;
  const bpct = duration ? (buffered / duration) * 100 : 0;
  const show = visible || !playing || menu !== null;

  return (
    <div
      ref={wrapRef}
      onMouseMove={poke}
      onMouseLeave={() => playing && setVisible(false)}
      className={cn("player-frame group relative aspect-video w-full overflow-hidden bg-player", !show && "cursor-none")}
    >
      <video
        ref={videoRef}
        poster={poster ?? undefined}
        playsInline
        onClick={toggle}
        onDoubleClick={toggleFs}
        onContextMenu={(e) => e.preventDefault()}
        controlsList="nodownload"
        className="size-full bg-player object-contain"
      />

      {buffering && !error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Loader2 className="size-12 animate-spin text-primary" />
        </div>
      )}

      {!playing && !buffering && !error && (
        <button type="button" onClick={toggle} aria-label="Play" className="absolute left-1/2 top-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow transition-transform hover:scale-105">
          <Play className="ml-1 size-9 fill-current" />
        </button>
      )}

      {error && (
        <div className="absolute inset-0 grid place-items-center bg-player/90 p-6 text-center">
          <div>
            <p className="font-display text-xl text-player-foreground">{error}</p>
            <p className="mt-1 text-sm text-player-muted">Check the video route and the API token settings.</p>
          </div>
        </div>
      )}

      {/* controls */}
      <div className={cn("player-scrim absolute inset-x-0 bottom-0 px-4 pb-3 pt-14 transition-opacity duration-300", show ? "opacity-100" : "pointer-events-none opacity-0")}>
        <div className="group/bar relative h-1.5 cursor-pointer rounded-full bg-player-track transition-all hover:h-2.5">
          <div className="absolute inset-y-0 left-0 rounded-full bg-player-buffer" style={{ width: `${bpct}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct}%` }} />
          <input
            type="range" min={0} max={duration || 0} step={0.1} value={current} aria-label="Seek"
            onChange={(e) => { const v = videoRef.current; if (v) v.currentTime = Number(e.target.value); }}
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          />
        </div>

        <div className="mt-2 flex items-center gap-1 text-player-foreground">
          <Ctl label={playing ? "Pause" : "Play"} onClick={toggle}>{playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}</Ctl>
          <Ctl label="Back 10 seconds" onClick={() => seekBy(-10)}><RotateCcw className="size-5" /></Ctl>
          <Ctl label="Forward 10 seconds" onClick={() => seekBy(10)}><RotateCw className="size-5" /></Ctl>
          <div className="group/vol flex items-center">
            <Ctl label={muted ? "Unmute" : "Mute"} onClick={() => { const v = videoRef.current; if (v) v.muted = !v.muted; }}>
              {muted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </Ctl>
            <input
              type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} aria-label="Volume"
              onChange={(e) => { const v = videoRef.current; if (v) { v.volume = Number(e.target.value); v.muted = false; } }}
              className="player-range w-0 opacity-0 transition-all group-hover/vol:w-20 group-hover/vol:opacity-100"
            />
          </div>
          <span className="ml-2 font-mono text-xs tabular-nums text-player-muted">{fmt(current)} / {fmt(duration)}</span>

          <div className="relative ml-auto flex items-center gap-1">
            {menu && (
              <ul className="absolute bottom-12 right-0 min-w-32 overflow-hidden rounded-lg border border-border bg-popover py-1 text-sm text-popover-foreground shadow-xl">
                {menu === "speed" && SPEEDS.map((s) => <Row key={s} label={s === 1 ? "Normal" : `${s}x`} active={s === speed} onClick={() => setRate(s)} />)}
                {menu === "quality" && [{ id: -1, label: "Auto" }, ...[...levels].reverse()].map((l) => <Row key={l.id} label={l.label} active={l.id === level} onClick={() => setQuality(l.id)} />)}
              </ul>
            )}
            <button type="button" onClick={() => setMenu(menu === "speed" ? null : "speed")} className="rounded-md px-2 py-1 font-mono text-xs font-bold hover:bg-player-track">{speed}x</button>
            {levels.length > 1 && <Ctl label="Quality" onClick={() => setMenu(menu === "quality" ? null : "quality")}><Settings className="size-5" /></Ctl>}
            <Ctl label="Picture in picture" onClick={() => { const v = videoRef.current; if (!v) return; document.pictureInPictureElement ? document.exitPictureInPicture() : v.requestPictureInPicture?.().catch(() => {}); }}><PictureInPicture2 className="size-5" /></Ctl>
            <Ctl label={fs ? "Exit fullscreen" : "Fullscreen"} onClick={toggleFs}>{fs ? <Minimize className="size-5" /> : <Maximize className="size-5" />}</Ctl>
          </div>
        </div>
      </div>
    </div>
  );
}

function Ctl({ children, onClick, label }: { children: ReactNode; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="grid size-9 place-items-center rounded-full transition-colors hover:bg-player-track">
      {children}
    </button>
  );
}

function Row({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className={cn("flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left font-semibold hover:bg-accent", active && "text-primary")}>
        {label}{active && <span className="size-1.5 rounded-full bg-primary" />}
      </button>
    </li>
  );
}
