import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";
import type { MediaItem } from "../../types";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";

type Props = {
  item: MediaItem;
  previewAssetVersion: number;
  selected: boolean;
  onToggleSelected: () => void;
  onOpenTagging: () => void;
  onOpenPlayer: () => void;
};

export function LibraryCard({
  item,
  previewAssetVersion,
  selected,
  onToggleSelected,
  onOpenTagging,
  onOpenPlayer,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [videoMounted, setVideoMounted] = useState(false);
  const [toolActionBusy, setToolActionBusy] = useState(false);

  const movedToVault = Boolean(item.canonical_path?.trim());
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

  async function onOpenInVLC() {
    try {
      setToolActionBusy(true);
      await apiFetch<{ ok: boolean }>(`/api/library/${item.id}/open-vlc`, {
        method: "POST",
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to open in VLC");
    } finally {
      setToolActionBusy(false);
    }
  }

  return (
    <div
      className={`surface-card overflow-hidden transition ${
        selected
          ? "border-(--success-border) shadow-[0_0_0_1px_rgba(103,188,153,0.18)]"
          : ""
      }`}
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
          <Badge variant={item.is_tagged ? "success" : "warning"}>
            {item.is_tagged ? "Tagged" : "Untagged"}
          </Badge>
          {movedToVault ? <Badge variant="info">Moved</Badge> : null}
          {item.media_type === "series_episode" &&
          item.season_number > 0 &&
          item.episode_number > 0 ? (
            <Badge variant="accent">
              S{String(item.season_number).padStart(2, "0")}E
              {String(item.episode_number).padStart(2, "0")}
            </Badge>
          ) : null}
        </div>

        <label className="media-select-pill absolute right-3 top-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
          />
          Select
        </label>
      </div>

      <div className="p-5">
        <h3 className="truncate text-base font-semibold text-(--text-primary)">
          {item.title}
        </h3>
        <div className="mt-1 truncate text-sm text-(--text-muted)">
          {item.file_name}
        </div>

        {item.series_name ? (
          <div className="mt-2 truncate text-sm text-(--text-muted)">
            Series: {item.series_name}
          </div>
        ) : null}

        {item.company_name ? (
          <div className="mt-1 truncate text-sm text-(--text-muted)">
            Company: {item.company_name}
          </div>
        ) : null}

        <div className="mt-4 grid gap-2 rounded-2xl border border-(--border-subtle) bg-(--surface-2) p-3 text-xs text-(--text-muted)">
          <div>Duration: {formatDuration(item.duration_seconds)}</div>
          <div>
            Resolution:{" "}
            {item.width > 0 && item.height > 0
              ? `${item.width}x${item.height}`
              : "Unknown"}
          </div>
          <div>Size: {formatBytes(item.filesize_bytes)}</div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onOpenTagging}>
            Edit / Tag
          </Button>
          <Button variant="primary" size="sm" onClick={onOpenPlayer}>
            Player
          </Button>
          <Button
            onClick={onOpenInVLC}
            disabled={toolActionBusy}
            variant="outline"
            size="sm"
          >
            VLC
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatMediaType(value: MediaItem["media_type"]) {
  if (value === "series_episode") return "Series Episode";
  if (value === "movie") return "Movie";
  return "Video";
}

function formatDuration(seconds: number) {
  if (!seconds || seconds <= 0) return "Unknown";

  const rounded = Math.floor(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  return `${minutes}m ${secs}s`;
}

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return "Unknown";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
