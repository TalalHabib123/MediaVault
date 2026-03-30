import { useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import type { MoveJob } from "../../types";

export function MoveJobNotification(props: {
  job: MoveJob;
  onDismiss: () => void;
}) {
  const { job, onDismiss } = props;
  const [expanded, setExpanded] = useState(false);
  const running = job.status === "running";
  const completed = job.status === "completed";
  const pendingCount = job.items.filter((item) => item.status === "pending").length;
  const currentCount = job.items.filter((item) => item.status === "running").length;
  const doneCount = job.items.filter(
    (item) =>
      item.status === "moved" ||
      item.status === "already_managed" ||
      item.status === "failed",
  ).length;

  return (
    <Card
      className={`pointer-events-auto p-4 ${
        running
          ? "border-(--warning-border)"
          : job.failed_items > 0
            ? "border-(--warning-border)"
            : "border-(--success-border)"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">
            {running ? "Moving To Vault" : "Move Job Complete"}
          </div>
          <div className="mt-1 text-xs text-(--text-muted)">
            {job.completed_items}/{job.total_items} item(s) processed
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setExpanded((prev) => !prev)}>
            {expanded ? "Hide Details" : "Details"}
          </Button>
          {!running ? (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          ) : null}
        </div>
      </div>

      <div className="progress-track mt-4">
        <div
          className="progress-fill bg-(--warning)"
          style={{ width: `${Math.max(0, Math.min(job.progress_percent, 100))}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="warning">{job.progress_percent}%</Badge>
        <Badge variant="success">Moved {job.succeeded_items}</Badge>
        <Badge variant="info">Already {job.already_managed_items}</Badge>
        <Badge variant={job.failed_items > 0 ? "danger" : "default"}>
          Failed {job.failed_items}
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
              {formatMoveStage(job.current_stage)}
            </div>
          ) : null}
        </div>
      ) : null}

      {expanded ? (
        <div className="surface-muted mt-4 rounded-[1.1rem] p-3">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <DetailStat label="Done" value={String(doneCount)} />
            <DetailStat label="Current" value={String(currentCount)} />
            <DetailStat label="Remaining" value={String(pendingCount)} />
          </div>

          <div className="mt-3 max-h-72 space-y-3 overflow-auto pr-1">
            {job.items.map((item) => (
              <MoveJobItemRow key={item.media_id} item={item} />
            ))}
          </div>
        </div>
      ) : null}

      {completed && job.failed_items === 0 ? (
        <div className="mt-3 text-xs text-(--text-muted)">
          All requested move tasks have been handled.
        </div>
      ) : null}
    </Card>
  );
}

function MoveJobItemRow(props: { item: MoveJob["items"][number] }) {
  const { item } = props;
  const barClass =
    item.status === "failed"
      ? "bg-[var(--danger)]"
      : item.status === "already_managed"
        ? "bg-[var(--info)]"
        : item.status === "moved"
          ? "bg-[var(--success)]"
          : "bg-[var(--warning)]";

  return (
    <div className="rounded-2xl border border-(--border-subtle) bg-(--surface-2) p-3 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {item.title || `#${item.media_id}`}
          </div>
          <div className="mt-1 text-(--text-muted)">
            {formatMoveStage(item.stage)}
          </div>
        </div>
        <Badge variant="default">{formatMoveStatus(item.status)}</Badge>
      </div>

      <div className="progress-track mt-3">
        <div
          className={`progress-fill ${barClass}`}
          style={{ width: `${Math.max(0, Math.min(item.progress_percent, 100))}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-(--text-muted)">
        <span>{item.progress_percent}%</span>
        {item.error ? <span className="truncate">{item.error}</span> : null}
      </div>
    </div>
  );
}

function DetailStat(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-(--border-subtle) bg-(--surface-2) px-3 py-2">
      <div className="page-kicker">{props.label}</div>
      <div className="mt-1 text-sm font-semibold">{props.value}</div>
    </div>
  );
}

export function formatMoveStage(stage: string) {
  switch (stage) {
    case "queued":
      return "Queued";
    case "validating":
      return "Validating source";
    case "preparing":
      return "Preparing destination";
    case "transferring":
      return "Transferring file";
    case "finalizing":
      return "Updating library record";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return stage || "Pending";
  }
}

export function formatMoveStatus(status: string) {
  switch (status) {
    case "moved":
      return "Moved";
    case "already_managed":
      return "Already Moved";
    case "running":
      return "Running";
    case "failed":
      return "Failed";
    case "pending":
      return "Pending";
    default:
      return status;
  }
}
