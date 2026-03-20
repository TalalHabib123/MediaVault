import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "../types";

type Props = {
  item: MediaItem;
  onOpenPlayer: () => void;
  onOpenVLC: () => void;
  onEditTag: () => void;
};

export default function SearchResultCard({
  item,
  onOpenPlayer,
  onOpenVLC,
  onEditTag,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [videoMounted, setVideoMounted] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hovered) {
      void video.play().catch(() => {});
    } else {
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        // ignore
      }
    }
  }, [hovered, videoMounted]);

  return (
    <div
      className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm transition hover:border-zinc-700"
      onMouseEnter={() => {
        setVideoMounted(true);
        setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-black">
        <img
          src={`/api/library/${item.id}/thumbnail`}
          alt={item.title}
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 ${
            hovered ? "opacity-0" : "opacity-100"
          }`}
          loading="lazy"
        />

        {videoMounted ? (
          <video
            ref={videoRef}
            src={`/api/library/${item.id}/hover-preview`}
            muted
            loop
            playsInline
            preload="metadata"
            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 ${
              hovered ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : null}

        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
          <Badge>{formatMediaType(item.media_type)}</Badge>
          {item.series_name ? <Badge>{item.series_name}</Badge> : null}
        </div>
      </div>

      <div className="p-4">
        <h3 className="truncate text-sm font-medium text-zinc-100">{item.title}</h3>

        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
          {item.company_name ? <span>{item.company_name}</span> : null}
          <span>{formatDuration(item.duration_seconds)}</span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            onClick={onOpenPlayer}
            className="rounded-lg bg-white px-3 py-2 text-sm text-black hover:bg-gray-200 *:disabled:bg-gray-400 disabled:text-gray-700 disabled:cursor-not-allowed"
          >
            Player
          </button>
          <button
            onClick={onOpenVLC}
            className="rounded-lg bg-orange-500 px-3 py-2 text-sm text-zinc-100 hover:bg-orange-600 disabled:opacity-50"
          >
            VLC
          </button>
          <button
            onClick={onEditTag}
            className="rounded-lg border border-zinc-700 px-2 py-2 text-xs text-zinc-200 hover:bg-zinc-800"
          >
            Edit Tag
          </button>
        </div>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-zinc-700 bg-zinc-900/80 px-2.5 py-1 text-[11px] text-zinc-200 backdrop-blur">
      {children}
    </span>
  );
}

function formatMediaType(value: MediaItem["media_type"]) {
  if (value === "series_episode") return "Series";
  if (value === "movie") return "Movie";
  return "Video";
}

function formatDuration(seconds: number) {
  if (!seconds || seconds <= 0) return "Unknown";

  const rounded = Math.floor(seconds);
  const hrs = Math.floor(rounded / 3600);
  const mins = Math.floor((rounded % 3600) / 60);

  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}