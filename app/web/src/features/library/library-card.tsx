import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";
import type { MediaItem } from "../../types";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  formatDuration,
  formatMediaType,
  formatResolution,
} from "./media-format";

type Props = {
  item: MediaItem;
  previewAssetVersion: number;
  selected: boolean;
  onToggleSelected: () => void;
  onOpenTagging: () => void;
  onOpenPlayer: () => void;
  openVlcAvailable: boolean;
};

export function LibraryCard({
  item,
  previewAssetVersion,
  selected,
  onToggleSelected,
  onOpenTagging,
  onOpenPlayer,
  openVlcAvailable,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [videoMounted, setVideoMounted] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
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
    if (!openVlcAvailable) return;

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
    <article
      className={`media-card group ${selected ? "media-card-selected" : ""}`}
      onMouseEnter={() => {
        setVideoMounted(true);
        setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="media-poster">
        {!imageFailed ? (
          <img
            src={thumbnailSrc}
            alt={item.title}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
              hovered ? "opacity-0" : "opacity-100"
            }`}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <MissingThumbnail title={item.title} type={item.media_type} />
        )}

        {videoMounted ? (
          <video
            ref={videoRef}
            src={hoverPreviewSrc}
            muted
            loop
            playsInline
            preload="metadata"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
              hovered ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : null}

        <div className="media-card-gradient" />

        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <Badge variant="default">{formatMediaType(item.media_type)}</Badge>
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

        <div className="media-card-actions">
          <Button variant="primary" size="sm" onClick={onOpenPlayer}>
            Play
          </Button>
          <Button variant="secondary" size="sm" onClick={onOpenTagging}>
            Details
          </Button>
          <Button
            onClick={onOpenInVLC}
            disabled={toolActionBusy || !openVlcAvailable}
            variant="outline"
            size="sm"
            title={
              openVlcAvailable
                ? "Open in VLC"
                : "VLC opens only on the host PC."
            }
          >
            VLC
          </Button>
        </div>
      </div>

      <div className="p-4">
        <h3 className="line-clamp-2 min-h-10 text-[15px] font-semibold leading-5 text-(--text-primary)">
          {item.title}
        </h3>

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-(--text-secondary)">
          <span>{formatDuration(item.duration_seconds)}</span>
          <span>{formatResolution(item)}</span>
          {item.company_name ? <span>{item.company_name}</span> : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant={item.is_tagged ? "success" : "warning"}>
            {item.is_tagged ? "Tagged" : "Needs tags"}
          </Badge>
          {movedToVault ? <Badge variant="info">Managed</Badge> : null}
          {item.series_name ? (
            <Badge variant="default">{item.series_name}</Badge>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function MissingThumbnail(props: {
  title: string;
  type: MediaItem["media_type"];
}) {
  const initials = props.title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,#15171c,#090a0d)]">
      <div className="text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-(--border-soft) bg-(--surface-2) text-xl font-bold text-(--accent)">
          {initials || "MV"}
        </div>
        <div className="mt-3 text-xs text-(--text-secondary)">
          {formatMediaType(props.type)}
        </div>
      </div>
    </div>
  );
}
