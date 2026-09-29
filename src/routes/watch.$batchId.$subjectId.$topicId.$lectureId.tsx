import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { VideoPlayer } from "@/components/video-player";
import { resolveLecture } from "@/lib/lecture.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/watch/$batchId/$subjectId/$topicId/$lectureId")({
  head: () => ({
    meta: [
      { title: "Watch Lecture — Stream Player" },
      { name: "description", content: "Secure lecture playback with adaptive streaming." },
      { property: "og:title", content: "Watch Lecture — Stream Player" },
      { property: "og:description", content: "Secure lecture playback with adaptive streaming." },
      { property: "og:type", content: "video.other" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WatchLecture,
});

type Lecture = Awaited<ReturnType<typeof resolveLecture>>;

function WatchLecture() {
  const params = Route.useParams();
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(false);
    setLecture(null);
    resolveLecture({ data: params })
      .then((result) => { if (active) setLecture(result); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [params.batchId, params.subjectId, params.topicId, params.lectureId, attempt]);

  if (lecture) {
    return (
      <main className="grid min-h-screen place-items-center bg-player">
        <div className="w-full max-w-[min(100vw,177vh)]">
          <VideoPlayer route={lecture.route} format={lecture.format} poster={lecture.image || undefined} autoPlay />
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-player px-6 text-player-foreground">
      {error ? (
        <div className="text-center">
          <p className="text-lg font-semibold">This lecture could not start.</p>
          <Button className="mt-4" onClick={() => setAttempt((value) => value + 1)}>
            <RefreshCw className="size-4" /> Try again
          </Button>
        </div>
      ) : (
        <Loader2 className="size-12 animate-spin text-primary" aria-label="Preparing lecture" />
      )}
    </main>
  );
}