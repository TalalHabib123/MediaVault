import { useMemo, useState } from "react";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import type { MediaItem, ScanSummary } from "../../types";
import { LibraryCard } from "./library-card";
import {
  formatDate,
  formatDuration,
  formatMediaTypeLong,
  getCurrentPath,
} from "./media-format";

type ViewMode = "grid" | "table";

type Props = {
  items: MediaItem[];
  total: number;
  previewAssetVersion: number;
  mediaType: string;
  mediaTypeLocked?: boolean;
  taggedStatus: string;
  onMediaTypeChange: (value: string) => void;
  onTaggedStatusChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  loading: boolean;
  onRefresh: () => void;
  onScan: () => void;
  scanLoading: boolean;
  scanSummary: ScanSummary | null;
  hasSources: boolean;
  onOpenItem: (id: number) => void;
  onOpenPlayer: (id: number) => void;
  selectedIds: number[];
  onToggleSelected: (id: number) => void;
  onClearSelection: () => void;
  onOpenBulkTagging: () => void;
  onBulkMove: () => void;
  bulkMoving: boolean;
  onRegenThumbnails: () => void;
  onRegenHovers: () => void;
  previewBusy: boolean;
  selectedCount: number;
  openVlcAvailable: boolean;
  title: string;
  description: string;
};

export function LibraryPage(props: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortKey, setSortKey] = useState<"created" | "title" | "duration">(
    "created",
  );
  const safeItems = useMemo(
    () => (Array.isArray(props.items) ? props.items : []),
    [props.items],
  );
  const safeErrors = Array.isArray(props.scanSummary?.errors)
    ? props.scanSummary.errors
    : [];

  const visibleItems = useMemo(() => {
    const sorted = [...safeItems];
    sorted.sort((a, b) => {
      if (sortKey === "title") return a.title.localeCompare(b.title);
      if (sortKey === "duration") {
        return b.duration_seconds - a.duration_seconds;
      }
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
    return sorted;
  }, [safeItems, sortKey]);

  return (
    <div className="grid gap-6">
      <section className="media-hero">
        <div className="relative z-10 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <div className="min-w-0">
            <h2 className="max-w-3xl text-4xl font-bold leading-tight text-(--text-primary)">
              {props.title}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-(--text-secondary)">
              {props.description}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Badge variant="accent">{props.total} indexed</Badge>
              <Badge variant={props.hasSources ? "success" : "warning"}>
                {props.hasSources ? "Sources ready" : "No sources"}
              </Badge>
              <Badge variant={props.previewBusy ? "warning" : "info"}>
                {props.previewBusy ? "Preview job running" : "Previews idle"}
              </Badge>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard label="Visible" value={String(visibleItems.length)} />
            <MetricCard label="Selected" value={String(props.selectedCount)} />
            <MetricCard
              label="Tagged"
              value={String(visibleItems.filter((item) => item.is_tagged).length)}
            />
            <MetricCard
              label="Needs Tags"
              value={String(visibleItems.filter((item) => !item.is_tagged).length)}
            />
          </div>
        </div>
      </section>

      <Card className="p-5">
        <CardHeader
          title="Browse Controls"
          description="Search and narrow the library without exposing full local paths on every card."
          action={
            <div className="segmented-control">
              <button
                type="button"
                className={viewMode === "grid" ? "active" : ""}
                onClick={() => setViewMode("grid")}
              >
                Grid
              </button>
              <button
                type="button"
                className={viewMode === "table" ? "active" : ""}
                onClick={() => setViewMode("table")}
              >
                Table
              </button>
            </div>
          }
        />

        <CardContent>
          <div className="grid gap-3 xl:grid-cols-[1.3fr_0.7fr_0.7fr_0.7fr]">
            <FieldBlock label="Search">
              <Input
                value={props.search}
                onChange={(event) => props.onSearchChange(event.target.value)}
                placeholder="Search title, filename, company..."
              />
            </FieldBlock>

            <FieldBlock label="Media Type">
              <Select
                value={props.mediaType}
                onChange={(event) => props.onMediaTypeChange(event.target.value)}
                disabled={props.mediaTypeLocked}
              >
                <option value="all">All</option>
                <option value="movie">Movie</option>
                <option value="series_episode">Series Episode</option>
                <option value="video">General Video</option>
              </Select>
            </FieldBlock>

            <FieldBlock label="Tagging Status">
              <Select
                value={props.taggedStatus}
                onChange={(event) =>
                  props.onTaggedStatusChange(event.target.value)
                }
              >
                <option value="all">All</option>
                <option value="tagged">Tagged</option>
                <option value="untagged">Untagged</option>
              </Select>
            </FieldBlock>

            <FieldBlock label="Sort">
              <Select
                value={sortKey}
                onChange={(event) =>
                  setSortKey(event.target.value as "created" | "title" | "duration")
                }
              >
                <option value="created">Recently Added</option>
                <option value="title">Title</option>
                <option value="duration">Duration</option>
              </Select>
            </FieldBlock>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {props.search.trim() ? (
              <FilterChip label={`Search: ${props.search}`} onClear={() => props.onSearchChange("")} />
            ) : null}
            {props.mediaType !== "all" ? (
              <FilterChip
                label={formatMediaTypeLabel(props.mediaType)}
                onClear={
                  props.mediaTypeLocked
                    ? undefined
                    : () => props.onMediaTypeChange("all")
                }
              />
            ) : null}
            {props.taggedStatus !== "all" ? (
              <FilterChip
                label={props.taggedStatus === "tagged" ? "Tagged" : "Untagged"}
                onClear={() => props.onTaggedStatusChange("all")}
              />
            ) : null}
          </div>

          {props.selectedCount > 0 ? (
            <div className="selection-bar mt-5">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="success">
                  {props.selectedCount} item(s) selected
                </Badge>
                <Button variant="success" onClick={props.onOpenBulkTagging}>
                  Bulk Tag
                </Button>
                <Button
                  variant="outline"
                  onClick={props.onBulkMove}
                  disabled={props.bulkMoving}
                >
                  {props.bulkMoving ? "Moving..." : "Move To Library"}
                </Button>
                <Button variant="ghost" onClick={props.onClearSelection}>
                  Clear
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="p-5">
        <CardHeader
          title="Library Items"
          description={
            props.loading
              ? "Loading media from the local index..."
              : `${visibleItems.length} result(s) on this page`
          }
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={props.onRefresh}>
                Refresh
              </Button>
              <Button
                variant="outline"
                onClick={props.onRegenThumbnails}
                disabled={props.previewBusy || visibleItems.length === 0}
              >
                {props.selectedCount > 0 ? "Rebuild Thumbs" : "Rebuild Thumbnails"}
              </Button>
              <Button
                variant="outline"
                onClick={props.onRegenHovers}
                disabled={props.previewBusy || visibleItems.length === 0}
              >
                Rebuild Previews
              </Button>
            </div>
          }
        />

        <CardContent>
          {!props.hasSources ? (
            <Alert tone="warning" className="mb-5">
              Add at least one source folder in Settings before scanning.
            </Alert>
          ) : null}

          {props.scanSummary && safeErrors.length > 0 ? (
            <Alert tone="danger" title="Last scan reported errors" className="mb-5">
              <div className="grid gap-1">
                {safeErrors.map((entry, index) => (
                  <div key={`${entry}-${index}`} className="break-all">
                    {entry}
                  </div>
                ))}
              </div>
            </Alert>
          ) : null}

          {props.loading ? (
            <LibrarySkeleton />
          ) : visibleItems.length === 0 ? (
            <div className="empty-state">
              No media found for the current filters.
            </div>
          ) : viewMode === "grid" ? (
            <div className="media-grid">
              {visibleItems.map((item) => (
                <LibraryCard
                  key={item.id}
                  item={item}
                  previewAssetVersion={props.previewAssetVersion}
                  selected={props.selectedIds.includes(item.id)}
                  onToggleSelected={() => props.onToggleSelected(item.id)}
                  onOpenTagging={() => props.onOpenItem(item.id)}
                  onOpenPlayer={() => props.onOpenPlayer(item.id)}
                  openVlcAvailable={props.openVlcAvailable}
                />
              ))}
            </div>
          ) : (
            <MediaTable
              items={visibleItems}
              selectedIds={props.selectedIds}
              onToggleSelected={props.onToggleSelected}
              onOpenItem={props.onOpenItem}
              onOpenPlayer={props.onOpenPlayer}
              previewAssetVersion={props.previewAssetVersion}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MediaTable(props: {
  items: MediaItem[];
  selectedIds: number[];
  onToggleSelected: (id: number) => void;
  onOpenItem: (id: number) => void;
  onOpenPlayer: (id: number) => void;
  previewAssetVersion: number;
}) {
  return (
    <div className="media-table-wrap">
      <table className="media-table">
        <thead>
          <tr>
            <th>Select</th>
            <th>Title</th>
            <th>Type</th>
            <th>Duration</th>
            <th>Company</th>
            <th>Status</th>
            <th>Path</th>
            <th>Scanned</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {props.items.map((item) => (
            <tr key={item.id}>
              <td>
                <input
                  type="checkbox"
                  checked={props.selectedIds.includes(item.id)}
                  onChange={() => props.onToggleSelected(item.id)}
                  aria-label={`Select ${item.title}`}
                />
              </td>
              <td>
                <div className="flex min-w-64 items-center gap-3">
                  <img
                    src={`/api/library/${item.id}/thumbnail?v=${props.previewAssetVersion}`}
                    alt=""
                    loading="lazy"
                    className="h-12 w-18 rounded-lg object-cover"
                  />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-(--text-primary)">
                      {item.title}
                    </div>
                    <div className="truncate text-xs text-(--text-muted)">
                      {item.file_name}
                    </div>
                  </div>
                </div>
              </td>
              <td>{formatMediaTypeLong(item.media_type)}</td>
              <td>{formatDuration(item.duration_seconds)}</td>
              <td>{item.company_name || "None"}</td>
              <td>
                <div className="flex flex-wrap gap-1">
                  <Badge variant={item.is_tagged ? "success" : "warning"}>
                    {item.is_tagged ? "Tagged" : "Untagged"}
                  </Badge>
                  {item.canonical_path ? <Badge variant="info">Managed</Badge> : null}
                </div>
              </td>
              <td>
                <span className="path-snippet" title={getCurrentPath(item)}>
                  {item.canonical_path ? "Managed path" : "Source path"}
                </span>
              </td>
              <td>{formatDate(item.updated_at || item.created_at)}</td>
              <td>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => props.onOpenPlayer(item.id)}
                  >
                    Play
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => props.onOpenItem(item.id)}
                  >
                    Details
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <div className="metric-card metric-card-compact">
      <div className="metric-label">{props.label}</div>
      <div className="mt-2 text-2xl font-bold text-(--text-primary)">
        {props.value}
      </div>
    </div>
  );
}

function FieldBlock(props: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="field-caption">{props.label}</span>
      {props.children}
    </label>
  );
}

function FilterChip(props: { label: string; onClear?: () => void }) {
  return (
    <span className="filter-chip">
      {props.label}
      {props.onClear ? (
        <button type="button" onClick={props.onClear} aria-label={`Clear ${props.label}`}>
          x
        </button>
      ) : null}
    </span>
  );
}

function LibrarySkeleton() {
  return (
    <div className="media-grid">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="skeleton-card">
          <div className="skeleton-thumb" />
          <div className="skeleton-line w-4/5" />
          <div className="skeleton-line w-2/3" />
        </div>
      ))}
    </div>
  );
}

function formatMediaTypeLabel(value: string) {
  if (value === "movie") return "Movies";
  if (value === "series_episode") return "Series";
  if (value === "video") return "General Videos";
  return value;
}
