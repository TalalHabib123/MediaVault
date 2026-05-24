import type { PreviewGenerationJob } from "../../types";

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
