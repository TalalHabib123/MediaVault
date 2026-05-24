import type { MediaItem } from "../../types";

export function formatMediaType(value: MediaItem["media_type"]) {
  if (value === "series_episode") return "Series";
  if (value === "movie") return "Movie";
  return "Video";
}

export function formatMediaTypeLong(value: MediaItem["media_type"]) {
  if (value === "series_episode") return "Series Episode";
  if (value === "movie") return "Movie";
  return "General Video";
}

export function formatDuration(seconds: number) {
  if (!seconds || seconds <= 0) return "Unknown";

  const rounded = Math.floor(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatDurationPrecise(seconds: number) {
  if (!seconds || seconds <= 0) return "Unknown";

  const rounded = Math.floor(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  return `${minutes}m ${secs}s`;
}

export function formatBytes(bytes: number) {
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

export function formatResolution(item: MediaItem) {
  return item.width > 0 && item.height > 0
    ? `${item.width}x${item.height}`
    : "Unknown";
}

export function formatDate(value: string) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function getCurrentPath(item: MediaItem) {
  return item.canonical_path || item.source_path;
}
