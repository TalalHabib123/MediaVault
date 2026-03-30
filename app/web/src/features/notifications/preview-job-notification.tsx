import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import type { PreviewGenerationJob } from "../../types";

export function PreviewJobNotification(props: {
  job: PreviewGenerationJob;
  onDismiss: () => void;
}) {
  const { job, onDismiss } = props;
  const completed = job.status === "completed";
  const canceled = job.status === "canceled";
  const running = job.status === "running";

  return (
    <Card
      className={`pointer-events-auto p-4 ${
        running
          ? "border-(--info-border)"
          : canceled
            ? "border-(--warning-border)"
            : "border-(--success-border)"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">
            {running
              ? formatPreviewJobTitle(job)
              : canceled
                ? `${formatPreviewJobTitle(job)} Canceled`
                : `${formatPreviewJobTitle(job)} Complete`}
          </div>
          <div className="mt-1 text-xs text-(--text-muted)">
            {job.completed_steps}/{job.total_steps} steps across {job.total_items}{" "}
            item(s)
          </div>
        </div>

        {!running ? (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        ) : null}
      </div>

      <div className="progress-track mt-4">
        <div
          className="progress-fill bg-(--info)"
          style={{ width: `${Math.max(0, Math.min(job.progress_percent, 100))}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="info">{job.progress_percent}%</Badge>
        <Badge variant="success">Success {job.succeeded_steps}</Badge>
        <Badge variant={job.failed_steps > 0 ? "warning" : "default"}>
          Issues {job.failed_steps}
        </Badge>
      </div>

      {job.current_title ? (
        <div className="surface-muted mt-4 rounded-[1.1rem] p-3 text-xs">
          <div className="page-kicker">Current</div>
          <div className="mt-2 truncate text-sm font-medium">
            {job.current_title}
          </div>
          {job.current_stage ? (
            <div className="mt-1 text-(--text-muted)">
              {formatPreviewStage(job.current_stage)}
            </div>
          ) : null}
        </div>
      ) : null}

      {completed && job.failed_steps === 0 ? (
        <div className="mt-3 text-xs text-(--text-muted)">
          {job.job_type === "regen_thumbnails"
            ? "All requested thumbnails finished successfully."
            : job.job_type === "regen_hovers"
              ? "All requested hover previews finished successfully."
              : "All thumbnails and hover previews finished successfully."}
        </div>
      ) : null}

      {job.errors.length > 0 ? (
        <div className="surface-muted mt-4 rounded-[1.1rem] p-3 text-xs">
          <div className="font-medium">Recent issues</div>
          <div className="mt-2 grid gap-1 text-(--text-muted)">
            {job.errors.slice(0, 3).map((entry, index) => (
              <div key={`${entry}-${index}`}>{entry}</div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export function formatPreviewJobTitle(job: PreviewGenerationJob) {
  switch (job.job_type) {
    case "regen_thumbnails":
      return "Thumbnail Regeneration";
    case "regen_hovers":
      return "Hover Regeneration";
    default:
      return "Preview Generation";
  }
}

export function formatPreviewStage(stage: string) {
  switch (stage) {
    case "thumbnail":
      return "Generating thumbnail";
    case "hover":
      return "Generating hover preview";
    default:
      return stage || "Working";
  }
}
