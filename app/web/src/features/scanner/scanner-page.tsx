import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import type {
  AppConfig,
  MoveJob,
  PreviewGenerationJob,
  ScanSummary,
} from "../../types";

type Props = {
  config: AppConfig;
  scanLoading: boolean;
  scanSummary: ScanSummary | null;
  previewJob: PreviewGenerationJob | null;
  moveJob: MoveJob | null;
  onScan: () => void;
  onRefresh: () => void;
  onRegenThumbnails: () => void;
  onRegenHovers: () => void;
  previewBusy: boolean;
  visibleCount: number;
};

export function ScannerPage({
  config,
  scanLoading,
  scanSummary,
  previewJob,
  moveJob,
  onScan,
  onRefresh,
  onRegenThumbnails,
  onRegenHovers,
  previewBusy,
  visibleCount,
}: Props) {
  const hasSources = config.paths.sources.length > 0;
  const scanErrors = Array.isArray(scanSummary?.errors)
    ? scanSummary.errors
    : [];

  return (
    <div className="grid gap-6">
      <section className="media-hero compact">
        <div className="relative z-10">
          <h2 className="max-w-3xl text-4xl font-bold text-(--text-primary)">
            Scanner and preview operations
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-(--text-secondary)">
            Manage source folders, run local scans, rebuild preview assets, and
            review the latest ingestion result without dumping raw logs into the
            main library view.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              variant="primary"
              size="lg"
              onClick={onScan}
              disabled={scanLoading || !hasSources}
            >
              {scanLoading ? "Scanning..." : "Scan All Sources"}
            </Button>
            <Button variant="secondary" size="lg" onClick={onRefresh}>
              Refresh Library
            </Button>
          </div>
        </div>
      </section>

      {!hasSources ? (
        <Alert tone="warning">
          Add at least one source folder in Settings before scanning.
        </Alert>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <Card className="p-5">
          <CardHeader
            title="Source Folders"
            description="MediaVault scans these directories recursively and keeps one canonical path per video."
          />
          <CardContent className="grid gap-3">
            {config.paths.sources.length === 0 ? (
              <div className="empty-state">No source folders configured.</div>
            ) : (
              config.paths.sources.map((source, index) => (
                <div
                  key={`${source}-${index}`}
                  className="source-row"
                  title={source}
                >
                  <span>{source}</span>
                  <Badge variant="info">Recursive</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="p-5">
          <CardHeader title="Current Work" description="Long-running jobs stay visible here and in the notification dock." />
          <CardContent className="grid gap-3">
            <JobStatus
              label="Scan"
              active={scanLoading}
              value={scanLoading ? "Running" : "Idle"}
            />
            <JobStatus
              label="Previews"
              active={previewJob?.status === "running"}
              value={
                previewJob?.status === "running"
                  ? `${previewJob.progress_percent}%`
                  : "Idle"
              }
            />
            <JobStatus
              label="Moves"
              active={moveJob?.status === "running"}
              value={
                moveJob?.status === "running"
                  ? `${moveJob.progress_percent}%`
                  : "Idle"
              }
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Card className="p-5">
          <CardHeader
            title="Preview Cache"
            description="Regenerate thumbnails or hover clips for the currently visible library result set."
          />
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Visible Items" value={String(visibleCount)} />
              <Metric
                label="Preview Job"
                value={previewBusy ? "Running" : "Idle"}
              />
              <Metric
                label="Current Stage"
                value={previewJob?.current_stage || "None"}
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={onRegenThumbnails}
                disabled={previewBusy || visibleCount === 0}
              >
                Rebuild Thumbnails
              </Button>
              <Button
                variant="secondary"
                onClick={onRegenHovers}
                disabled={previewBusy || visibleCount === 0}
              >
                Rebuild Hover Clips
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="p-5">
          <CardHeader
            title="Latest Scan Result"
            description="Summary from the last scan run in this browser session."
          />
          <CardContent>
            {!scanSummary ? (
              <div className="empty-state">
                No scan summary yet. Run a scan to populate this panel.
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-5">
                  <Metric label="Sources" value={String(scanSummary.sources)} />
                  <Metric label="Seen" value={String(scanSummary.files_seen)} />
                  <Metric label="Added" value={String(scanSummary.inserted)} />
                  <Metric label="Updated" value={String(scanSummary.updated)} />
                  <Metric label="Skipped" value={String(scanSummary.skipped)} />
                </div>

                {scanErrors.length > 0 ? (
                  <div className="log-viewer">
                    {scanErrors.map((entry, index) => (
                      <div key={`${entry}-${index}`}>{entry}</div>
                    ))}
                  </div>
                ) : (
                  <Alert tone="success">No scan errors reported.</Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function JobStatus(props: { label: string; value: string; active?: boolean }) {
  return (
    <div className="surface-muted flex items-center justify-between rounded-2xl px-4 py-3">
      <span className="text-sm text-(--text-secondary)">{props.label}</span>
      <Badge variant={props.active ? "warning" : "info"}>{props.value}</Badge>
    </div>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="metric-card metric-card-compact">
      <div className="metric-label">{props.label}</div>
      <div className="mt-2 text-xl font-bold text-(--text-primary)">
        {props.value}
      </div>
    </div>
  );
}
