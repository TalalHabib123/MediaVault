import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import type { MediaItem, ScanSummary } from "../../types";
import { LibraryCard } from "./library-card";

type Props = {
  items: MediaItem[];
  total: number;
  previewAssetVersion: number;
  mediaType: string;
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
};

export function LibraryPage(props: Props) {
  const safeItems = Array.isArray(props.items) ? props.items : [];
  const safeErrors = Array.isArray(props.scanSummary?.errors)
    ? props.scanSummary.errors
    : [];

  return (
    <div className="grid gap-6">
      <Card className="overflow-hidden p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(78,120,171,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(224,178,92,0.14),transparent_32%)]" />
        <div className="relative grid gap-5 xl:grid-cols-[1.6fr_1fr]">
          <div>
            <div className="page-kicker">Operations</div>
            <h2 className="brand-title mt-2 text-3xl">Scan and control the vault</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
              The library surface keeps discovery, cleanup, preview generation,
              and move workflows in one place while preserving the current media
              management logic.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard label="Total Items" value={String(props.total)} />
            <MetricCard
              label="Selected"
              value={String(props.selectedCount)}
              accent={props.selectedCount > 0}
            />
            <MetricCard
              label="Preview Jobs"
              value={props.previewBusy ? "Running" : "Idle"}
              accent={props.previewBusy}
            />
            <MetricCard
              label="Sources"
              value={props.hasSources ? "Ready" : "Missing"}
              accent={props.hasSources}
            />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <CardHeader
          title="Vault Actions"
          description="Run scans, refresh visible results, or regenerate previews using the current library selection."
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={props.onRefresh}>
                Refresh
              </Button>
              <Button
                variant="primary"
                onClick={props.onScan}
                disabled={props.scanLoading || !props.hasSources}
              >
                {props.scanLoading ? "Scanning..." : "Scan Library"}
              </Button>
              <Button
                variant="outline"
                onClick={props.onRegenThumbnails}
                disabled={props.previewBusy || safeItems.length === 0}
              >
                {props.previewBusy
                  ? "Preview Job Running..."
                  : props.selectedCount > 0
                    ? "Regen Thumbs (Selected)"
                    : "Regen Thumbs"}
              </Button>
              <Button
                variant="outline"
                onClick={props.onRegenHovers}
                disabled={props.previewBusy || safeItems.length === 0}
              >
                {props.previewBusy
                  ? "Preview Job Running..."
                  : props.selectedCount > 0
                    ? "Regen Hovers (Selected)"
                    : "Regen Hovers"}
              </Button>
            </div>
          }
        />

        <CardContent>
          {!props.hasSources ? (
            <Alert tone="warning">
              Add at least one source folder in Settings before scanning.
            </Alert>
          ) : null}

          {props.scanSummary ? (
            <div className="mt-5 grid gap-3 md:grid-cols-5">
              <MetricCard label="Sources" value={String(props.scanSummary.sources)} compact />
              <MetricCard label="Files Seen" value={String(props.scanSummary.files_seen)} compact />
              <MetricCard label="Inserted" value={String(props.scanSummary.inserted)} compact />
              <MetricCard label="Updated" value={String(props.scanSummary.updated)} compact />
              <MetricCard label="Skipped" value={String(props.scanSummary.skipped)} compact />
            </div>
          ) : null}

          {props.scanSummary && safeErrors.length > 0 ? (
            <Alert tone="danger" title="Scan errors" className="mt-5">
              <div className="grid gap-1">
                {safeErrors.map((entry, index) => (
                  <div key={`${entry}-${index}`} className="break-all">
                    {entry}
                  </div>
                ))}
              </div>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card className="p-6">
        <CardHeader
          title="Discovered Media"
          description={`Total in database: ${props.total}`}
        />

        <CardContent>
          <div className="grid gap-3 xl:grid-cols-[1.4fr_0.8fr_0.8fr]">
            <FieldBlock label="Search">
              <Input
                value={props.search}
                onChange={(event) => props.onSearchChange(event.target.value)}
                placeholder="Search title, file, path, company"
              />
            </FieldBlock>

            <FieldBlock label="Media Type">
              <Select
                value={props.mediaType}
                onChange={(event) => props.onMediaTypeChange(event.target.value)}
              >
                <option value="all">All</option>
                <option value="movie">Movie</option>
                <option value="series_episode">Series Episode</option>
                <option value="video">Video</option>
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
                  {props.bulkMoving ? "Moving..." : "Bulk Move"}
                </Button>
                <Button variant="ghost" onClick={props.onClearSelection}>
                  Clear Selection
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-6">
            {props.loading ? (
              <div className="empty-state">Loading library...</div>
            ) : safeItems.length === 0 ? (
              <div className="empty-state">
                No media found for the current filters.
              </div>
            ) : (
              <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
                {safeItems.map((item) => (
                  <LibraryCard
                    key={item.id}
                    item={item}
                    previewAssetVersion={props.previewAssetVersion}
                    selected={props.selectedIds.includes(item.id)}
                    onToggleSelected={() => props.onToggleSelected(item.id)}
                    onOpenTagging={() => props.onOpenItem(item.id)}
                    onOpenPlayer={() => props.onOpenPlayer(item.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard(props: {
  label: string;
  value: string;
  accent?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`metric-card ${props.compact ? "metric-card-compact" : ""} ${
        props.accent ? "metric-card-accent" : ""
      }`}
    >
      <div className="page-kicker">{props.label}</div>
      <div className={props.compact ? "mt-2 text-xl font-semibold" : "mt-3 text-3xl font-semibold"}>
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
      <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
        {props.label}
      </span>
      {props.children}
    </label>
  );
}
