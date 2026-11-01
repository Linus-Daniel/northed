"use client";

import type { ContentVideo } from "@/convex/lib/validators";
import { PlayIcon } from "./icons";

/**
 * Renders a lesson video.
 *
 * NorthEd plays lessons from a link (YouTube, Vimeo, Mux, Cloudflare Stream)
 * or from a file the tutor uploaded to Convex file storage. `kind: "embed"`
 * is rendered in an <iframe>, `kind: "file"` with the native player.
 */
export default function VideoPlayer({
  video,
  title,
  thumbnailUrl,
}: {
  video: ContentVideo | null;
  title: string;
  thumbnailUrl?: string | null;
}) {
  if (video === null) {
    return (
      <div className="grid aspect-video w-full place-items-center border border-rule bg-paper-deep text-sm text-ink-faint">
        This lesson&rsquo;s video is not available.
      </div>
    );
  }

  if (video.kind === "file") {
    return (
      <video
        className="aspect-video w-full bg-ink object-contain"
        controls
        preload="metadata"
        poster={thumbnailUrl ?? undefined}
        src={video.url}
      />
    );
  }

  return (
    <div className="aspect-video w-full overflow-hidden border border-rule bg-ink">
      <iframe
        className="h-full w-full"
        src={video.url}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

/** Small preview used in lists, where the real player is too heavy. */
export function LessonPoster({
  provider,
  title,
  thumbnailUrl,
  className = "",
}: {
  provider?: string | null;
  title: string;
  thumbnailUrl?: string | null;
  className?: string;
}) {
  if (thumbnailUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={thumbnailUrl}
        alt={`Thumbnail for ${title}`}
        loading="lazy"
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`relative grid h-full w-full place-items-center overflow-hidden bg-forest-deep ${className}`}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 20%, #2f7a5f 0, transparent 55%), radial-gradient(circle at 75% 80%, #b4471f 0, transparent 50%)",
        }}
      />
      <span className="relative grid h-12 w-12 place-items-center rounded-full border border-surface/40 bg-surface/10 text-xl text-surface">
        <PlayIcon />
      </span>
      <span className="absolute bottom-2 left-3 text-[0.65rem] uppercase tracking-[0.18em] text-surface/70">
        {provider ?? "video"}
      </span>
    </div>
  );
}
