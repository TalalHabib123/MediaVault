import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "../types";
import { apiFetch } from "../lib/api";

type Props = {
  item: MediaItem;
  selected: boolean;
  onToggleSelected: () => void;
  onOpenTagging: () => void;
  onOpenPlayer: () => void;
};

export default function LibraryCard({
  item,
  selected,
  onToggleSelected,
  onOpenTagging,
  onOpenPlayer,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [videoMounted, setVideoMounted] = useState(false);

  const [toolActionBusy, setToolActionBusy] = useState(false);

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

  async function onOpenInVLC() {
    if (!item) return;

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
      className={`overflow-hidden rounded-2xl border bg-zinc-900 transition ${
        selected
          ? "border-emerald-500/40 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]"
          : "border-zinc-800"
      }`}
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
          <StatusBadge tagged={item.is_tagged} />
          {item.media_type === "series_episode" &&
          item.season_number > 0 &&
          item.episode_number > 0 ? (
            <Badge>
              S{String(item.season_number).padStart(2, "0")}E
              {String(item.episode_number).padStart(2, "0")}
            </Badge>
          ) : null}
        </div>

        <label className="absolute right-3 top-3 flex cursor-pointer items-center gap-2 rounded-full bg-black/70 px-2.5 py-1 text-xs text-zinc-100 backdrop-blur">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
          />
          Select
        </label>

      </div>

      <div className="p-4">
        <h3 className="truncate text-base font-medium text-zinc-100">
          {item.title}
        </h3>
        <div className="mt-1 truncate text-sm text-zinc-400">
          {item.file_name}
        </div>

        {item.series_name ? (
          <div className="mt-2 truncate text-sm text-zinc-500">
            Series: {item.series_name}
          </div>
        ) : null}

        {item.company_name ? (
          <div className="mt-1 truncate text-sm text-zinc-500">
            Company: {item.company_name}
          </div>
        ) : null}

        <div className="mt-3 grid gap-1 text-xs text-zinc-500">
          <div>Duration: {formatDuration(item.duration_seconds)}</div>
          <div>
            Resolution:{" "}
            {item.width > 0 && item.height > 0
              ? `${item.width}x${item.height}`
              : "Unknown"}
          </div>
          <div>Size: {formatBytes(item.filesize_bytes)}</div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onOpenTagging}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            Edit / Tag
          </button>

          <button
            onClick={onOpenPlayer}
            className="rounded-lg bg-white px-3 py-2 text-sm text-black hover:bg-gray-200 *:disabled:bg-gray-400 disabled:text-gray-700 disabled:cursor-not-allowed"
          >
           Player
          </button>

          <button
            onClick={onOpenInVLC}
            disabled={toolActionBusy}
            className="rounded-lg bg-orange-500 px-3 py-2 text-sm text-zinc-100 hover:bg-orange-600 disabled:opacity-50"
          >
            VLC
          </button>
        </div>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-zinc-700 bg-zinc-900/80 px-2.5 py-1 text-xs text-zinc-200 backdrop-blur">
      {children}
    </span>
  );
}

function StatusBadge({ tagged }: { tagged: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs ${
        tagged
          ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
          : "border border-amber-500/40 bg-amber-500/10 text-amber-200"
      }`}
    >
      {tagged ? "Tagged" : "Untagged"}
    </span>
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
  const hrs = Math.floor(rounded / 3600);
  const mins = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;

  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
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
