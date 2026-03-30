import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "../../types";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";

type Props = {
  item: MediaItem;
  previewAssetVersion: number;
  onOpenPlayer: () => void;
  onOpenVLC: () => void;
  onEditTag: () => void;
};

export function SearchResultCard({
  item,
  previewAssetVersion,
  onOpenPlayer,
  onOpenVLC,
  onEditTag,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [videoMounted, setVideoMounted] = useState(false);

  const thumbnailSrc = `/api/library/${item.id}/thumbnail?v=${previewAssetVersion}`;
  const hoverPreviewSrc = `/api/library/${item.id}/hover-preview?v=${previewAssetVersion}`;

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
        // Ignore reset issues from unloaded media.
      }
    }
  }, [hovered, videoMounted]);

  return (
    <div
      className="surface-card overflow-hidden shadow-sm transition"
      onMouseEnter={() => {
        setVideoMounted(true);
        setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="media-preview relative aspect-video w-full overflow-hidden">
        <img
          src={thumbnailSrc}
          alt={item.title}
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 ${
            hovered ? "opacity-0" : "opacity-100"
          }`}
          loading="lazy"
        />

        {videoMounted ? (
          <video
            ref={videoRef}
            src={hoverPreviewSrc}
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
          <Badge variant="default">{formatMediaType(item.media_type)}</Badge>
          {item.series_name ? <Badge variant="accent">{item.series_name}</Badge> : null}
        </div>
      </div>

      <div className="p-5">
        <h3 className="truncate text-sm font-semibold text-(--text-primary)">
          {item.title}
        </h3>

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-(--text-muted)">
          {item.company_name ? <span>{item.company_name}</span> : null}
          <span>{formatDuration(item.duration_seconds)}</span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <Button
            onClick={onOpenPlayer}
            variant="primary"
            size="sm"
            className="w-full"
          >
            Player
          </Button>
          <Button
            onClick={onOpenVLC}
            variant="outline"
            size="sm"
            className="w-full"
          >
            VLC
          </Button>
          <Button
            onClick={onEditTag}
            variant="secondary"
            size="sm"
            className="w-full"
          >
            Edit Tag
          </Button>
        </div>
      </div>
    </div>
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
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
