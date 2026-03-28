export type AppConfig = {
  server: {
    host: string;
    port: number;
  };
  paths: {
    sources: string[];
    library_root: string;
    views_root: string;
    preview_cache: string;
  };
  tools: {
    ffmpeg: string;
    ffprobe: string;
    vlc: string;
  };
  mode: {
    portable: boolean;
  };
};

export type MediaType = "movie" | "series_episode" | "video";

export type MediaItem = {
  id: number;
  title: string;
  media_type: MediaType;
  source_path: string;
  canonical_path: string;
  file_name: string;
  extension: string;
  duration_seconds: number;
  width: number;
  height: number;
  video_codec: string;
  audio_codec: string;
  filesize_bytes: number;
  season_number: number;
  episode_number: number;
  type_source: "auto" | "manual";
  title_source: "auto" | "manual";
  sequence_source: "auto" | "manual";
  company_id: number | null;
  company_name: string;
  series_id: number | null;
  series_name: string;
  is_tagged: boolean;
  created_at: string;
  updated_at: string;
};

export type LibraryResponse = {
  items: MediaItem[];
  total: number;
  limit: number;
  offset: number;
  tagged_status: string;
};

export type ScanSummary = {
  sources: number;
  files_seen: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  preview_job?: PreviewGenerationJob | null;
};

export type PreviewGenerationJob = {
  id: string;
  job_type: "scan_warmup" | "regen_thumbnails" | "regen_hovers" | string;
  generate_thumbs: boolean;
  generate_hovers: boolean;
  force_regenerate: boolean;
  status: "running" | "completed" | "canceled" | string;
  total_items: number;
  total_steps: number;
  completed_steps: number;
  succeeded_steps: number;
  failed_steps: number;
  progress_percent: number;
  current_item_id: number;
  current_title: string;
  current_stage: "thumbnail" | "hover" | "" | string;
  errors: string[];
  started_at: string;
  finished_at: string;
};

export type PreviewProgressResponse = {
  job: PreviewGenerationJob | null;
};

export type PreviewRegenerateTarget = "thumbnails" | "hovers";

export type PreviewJobResponse = {
  ok: boolean;
  job: PreviewGenerationJob | null;
};

export type Company = {
  id: number;
  name: string;
};

export type Person = {
  id: number;
  name: string;
};

export type Category = {
  id: number;
  name: string;
  kind: "main" | "sub";
  parent_id: number | null;
  parent_name: string;
};

export type Tag = {
  id: number;
  name: string;
};

export type Series = {
  id: number;
  name: string;
  company_id: number | null;
  company_name: string;
};

export type MetadataOptions = {
  companies: Company[];
  people: Person[];
  categories: Category[];
  tags: Tag[];
  series: Series[];
};

export type MediaAssignments = {
  company_id: number | null;
  series_id: number | null;
  person_ids: number[];
  category_ids: number[];
  tag_ids: number[];
};

export type MediaDetailResponse = {
  item: MediaItem;
  assignments: MediaAssignments;
};

export type UpdateMediaPayload = {
  title: string;
  media_type: MediaType;
  season_number: number;
  episode_number: number;
};

export type UpdateTaggingPayload = {
  company_id: number | null;
  series_id: number | null;
  person_ids: number[];
  category_ids: number[];
  tag_ids: number[];
};

export type DeleteMediaMode = "delete_file" | "db_only";

export type DeleteMediaPayload = {
  mode: DeleteMediaMode;
};

export type DeleteMediaResponse = {
  ok: boolean;
  media_id: number;
  mode: DeleteMediaMode;
  file_deleted: boolean;
  preview_cache_cleaned: boolean;
};

export type PlayerContextResponse = {
  item: MediaItem;
  prev_episode_id: number | null;
  next_episode_id: number | null;
};

export type BulkTaggingPayload = {
  set_company: boolean;
  company_id: number | null;
  set_series: boolean;
  series_id: number | null;
  person_ids: number[];
  category_ids: number[];
  tag_ids: number[];
};

export type BulkMoveFailure = {
  media_id: number;
  error: string;
};

export type MoveJobItem = {
  media_id: number;
  title: string;
  status:
    | "pending"
    | "running"
    | "moved"
    | "already_managed"
    | "failed"
    | string;
  stage:
    | "queued"
    | "validating"
    | "preparing"
    | "transferring"
    | "finalizing"
    | "completed"
    | "failed"
    | string;
  progress_percent: number;
  already_managed: boolean;
  old_path: string;
  new_path: string;
  error: string;
};

export type MoveJob = {
  id: string;
  status: "running" | "completed" | string;
  total_items: number;
  completed_items: number;
  succeeded_items: number;
  already_managed_items: number;
  failed_items: number;
  progress_percent: number;
  current_item_id: number;
  current_title: string;
  current_stage: string;
  items: MoveJobItem[];
  started_at: string;
  finished_at: string;
};

export type MoveJobResponse = {
  ok: boolean;
  job: MoveJob | null;
};

export type MoveProgressResponse = {
  job: MoveJob | null;
};

export type BulkMoveResponse = {
  requested: number;
  moved: number;
  already_managed: number;
  failed: BulkMoveFailure[];
};

export type SearchTaggedResponse = {
  items: MediaItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  sort_dir: "asc" | "desc" | string;
};

export const emptyConfig: AppConfig = {
  server: {
    host: "127.0.0.1",
    port: 5000,
  },
  paths: {
    sources: [],
    library_root: "",
    views_root: "",
    preview_cache: "./data/previews",
  },
  tools: {
    ffmpeg: "./bin/ffmpeg.exe",
    ffprobe: "./bin/ffprobe.exe",
    vlc: "",
  },
  mode: {
    portable: true,
  },
};
