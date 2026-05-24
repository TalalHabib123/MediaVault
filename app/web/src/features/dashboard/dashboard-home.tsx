import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import type { MediaItem, PreviewGenerationJob, ScanSummary } from "../../types";
import type { TabKey } from "./dashboard-tabs";
import {
  formatBytes,
  formatDate,
  formatDuration,
  formatMediaTypeLong,
  formatResolution,
} from "../library/media-format";

type Props = {
  items: MediaItem[];
  total: number;
  previewAssetVersion: number;
  scanSummary: ScanSummary | null;
  previewJob: PreviewGenerationJob | null;
  selectedCount: number;
  hasSources: boolean;
  onOpenPlayer: (id: number) => void;
  onOpenItem: (id: number) => void;
  onTabChange: (tab: TabKey) => void;
  onScan: () => void;
  scanLoading: boolean;
};

export function DashboardHome({
  items,
  total,
  previewAssetVersion,
  scanSummary,
  previewJob,
  selectedCount,
  hasSources,
  onOpenPlayer,
  onOpenItem,
  onTabChange,
  onScan,
  scanLoading,
}: Props) {
  const safeItems = Array.isArray(items) ? items : [];
  const featured = safeItems[0] ?? null;
  const recentlyAdded = safeItems.slice(0, 8);
  const movies = safeItems.filter((item) => item.media_type === "movie").length;
  const series = safeItems.filter(
    (item) => item.media_type === "series_episode",
  ).length;
  const videos = safeItems.filter((item) => item.media_type === "video").length;
  const tagged = safeItems.filter((item) => item.is_tagged).length;
  const previewRunning = previewJob?.status === "running";

  return (
    <div className="grid gap-6">
      <section className="dashboard-hero">
        <div className="dashboard-hero-media">
          {featured ? (
            <img
              src={`/api/library/${featured.id}/thumbnail?v=${previewAssetVersion}`}
              alt=""
              className="h-full w-full object-cover"
              loading="eager"
            />
          ) : null}
        </div>
        <div className="dashboard-hero-overlay" />
        <div className="relative z-10 max-w-3xl">
          <h2 className="text-5xl font-bold leading-tight text-(--text-primary)">
            {featured ? featured.title : "Your private media vault is ready"}
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-(--text-secondary)">
            {featured
              ? `${formatMediaTypeLong(featured.media_type)} - ${formatDuration(featured.duration_seconds)} - ${formatResolution(featured)}`
              : "Add source folders, scan locally, and MediaVault will organize playable videos without duplicating files."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {featured ? (
              <>
                <Button variant="primary" size="lg" onClick={() => onOpenPlayer(featured.id)}>
                  Play
                </Button>
                <Button variant="secondary" size="lg" onClick={() => onOpenItem(featured.id)}>
                  Details
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                size="lg"
                onClick={onScan}
                disabled={scanLoading || !hasSources}
              >
                {scanLoading ? "Scanning..." : "Scan Library"}
              </Button>
            )}
            <Button variant="outline" size="lg" onClick={() => onTabChange("library")}>
              Browse All
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="Total Videos" value={String(total)} />
        <SummaryCard label="Movies" value={String(movies)} />
        <SummaryCard label="Series Episodes" value={String(series)} />
        <SummaryCard label="General Videos" value={String(videos)} />
        <SummaryCard label="Tagged" value={String(tagged)} />
        <SummaryCard label="Selected" value={String(selectedCount)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.7fr)]">
        <Card className="p-5">
          <CardHeader
            title="Recently Added"
            description="Freshly indexed media with lightweight previews."
            action={
              <Button variant="secondary" onClick={() => onTabChange("library")}>
                View Library
              </Button>
            }
          />
          <CardContent>
            {recentlyAdded.length === 0 ? (
              <div className="empty-state">
                No media yet. Add source folders in Settings and run a scan.
              </div>
            ) : (
              <div className="recent-strip">
                {recentlyAdded.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="recent-item"
                    onClick={() => onOpenItem(item.id)}
                  >
                    <img
                      src={`/api/library/${item.id}/thumbnail?v=${previewAssetVersion}`}
                      alt=""
                      loading="lazy"
                    />
                    <span className="recent-item-title">{item.title}</span>
                    <span className="recent-item-meta">
                      {formatMediaTypeLong(item.media_type)} -{" "}
                      {formatDuration(item.duration_seconds)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="p-5">
          <CardHeader title="Vault Health" description="Operational state from the current session." />
          <CardContent className="grid gap-3">
            <HealthRow
              label="Sources"
              value={hasSources ? "Configured" : "Missing"}
              tone={hasSources ? "success" : "warning"}
            />
            <HealthRow
              label="Preview Cache"
              value={previewRunning ? `${previewJob?.progress_percent ?? 0}%` : "Idle"}
              tone={previewRunning ? "warning" : "info"}
            />
            <HealthRow
              label="Last Scan"
              value={
                scanSummary
                  ? `${scanSummary.inserted} added, ${scanSummary.updated} updated`
                  : "No scan this session"
              }
              tone={scanSummary ? "success" : "info"}
            />
            <HealthRow
              label="Visible Size"
              value={formatBytes(
                safeItems.reduce((sum, item) => sum + item.filesize_bytes, 0),
              )}
              tone="info"
            />
          </CardContent>
        </Card>
      </section>

      <section className="quick-browse">
        <button type="button" onClick={() => onTabChange("movies")}>
          <span>Movies</span>
          <strong>{movies}</strong>
        </button>
        <button type="button" onClick={() => onTabChange("series")}>
          <span>Series</span>
          <strong>{series}</strong>
        </button>
        <button type="button" onClick={() => onTabChange("videos")}>
          <span>General Videos</span>
          <strong>{videos}</strong>
        </button>
        <button type="button" onClick={() => onTabChange("scanner")}>
          <span>Scanner</span>
          <strong>{scanSummary ? formatDate(new Date().toISOString()) : "Ready"}</strong>
        </button>
      </section>
    </div>
  );
}

function SummaryCard(props: { label: string; value: string }) {
  return (
    <div className="metric-card metric-card-compact">
      <div className="metric-label">{props.label}</div>
      <div className="mt-2 text-2xl font-bold text-(--text-primary)">
        {props.value}
      </div>
    </div>
  );
}

function HealthRow(props: {
  label: string;
  value: string;
  tone: "success" | "warning" | "info";
}) {
  return (
    <div className="surface-muted flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
      <span className="text-sm text-(--text-secondary)">{props.label}</span>
      <Badge variant={props.tone}>{props.value}</Badge>
    </div>
  );
}
