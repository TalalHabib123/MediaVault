# MediaVault Project Specification

Generated from repository inspection on 2026-05-16. This document describes the current implementation, not the intended future architecture.

## 1. Repository Overview

### 1.1 Basic Project Identity

| Item | Value |
|---|---|
| Project name | MediaVault |
| Main purpose | Local-first video/media library manager with tagging, preview generation, browser playback, VLC launch, and optional managed-file moves. |
| Current app type | Local web app with a Windows portable release wrapper. |
| Backend language | Go |
| Frontend framework | React + Vite + TypeScript |
| Database | SQLite via `modernc.org/sqlite` and `github.com/jmoiron/sqlx` |
| Media tools | `ffprobe.exe` for scan metadata, `ffmpeg.exe` for thumbnails and hover clips, optional VLC executable for host playback. |
| Primary run command | `go run ./cmd/server` from `app/` |
| Development run command | `.\scripts\dev.ps1` from repo root |
| Production build command | `.\scripts\build.ps1` from repo root |

### 1.2 Current Repository Tree

```text
MediaVault/
|-- README.md
|-- package-lock.json
|-- .gitignore
|-- app/
|   |-- go.mod
|   |-- go.sum
|   |-- cmd/server/main.go
|   |-- internal/
|   |   |-- api/server.go
|   |   |-- appfs/paths.go
|   |   |-- config/config.go
|   |   |-- db/db.go
|   |   |-- library/model.go
|   |   |-- library/repository.go
|   |   |-- media/deletion/service.go
|   |   |-- media/deletion/service_test.go
|   |   |-- media/metadata/ffprobe.go
|   |   |-- media/organizer/service.go
|   |   |-- media/previews/service.go
|   |   |-- media/scanner/scanner.go
|   |   |-- metadata/model.go
|   |   |-- metadata/repository.go
|   |   |-- static/static.go
|   |   `-- webui/webui.go
|   |-- migrations/
|   |-- assests/
|   `-- web/
|       |-- package.json
|       |-- package-lock.json
|       |-- vite.config.ts
|       |-- components.json
|       |-- src/
|       |   |-- main.tsx
|       |   |-- App.tsx
|       |   |-- root-app.tsx
|       |   |-- styles.css
|       |   |-- types.ts
|       |   |-- app/
|       |   |-- components/
|       |   |-- features/
|       |   |-- lib/
|       |   `-- pages/
|       |-- public/
|       `-- docs/
|-- bin/
|   |-- ffmpeg.exe
|   |-- ffplay.exe
|   `-- ffprobe.exe
|-- config/config.json
|-- data/
|   |-- app.db
|   |-- app.db-shm
|   |-- app.db-wal
|   |-- cache/
|   `-- previews/
|-- docs/
|   |-- MediaVault_Frontend_Redesign_Guide.md
|   |-- MediaVault_Project_Specification_Dump_Instructions.md
|   `-- MediaVault_Project_Specification.md
|-- logs/.gitkeep
|-- release/
`-- scripts/
    |-- build.ps1
    `-- dev.ps1
```

Excluded from the tree: `.git/`, `node_modules/`, `dist/`, generated release content details, preview cache files, and database binary content.

### 1.3 Important Top-Level Files

| Path | Purpose | Notes |
|---|---|---|
| `README.md` | Product goals, stack, features, roadmap. | Some listed features are planned or partial, not all fully implemented. |
| `scripts/dev.ps1` | Windows development runner. | Starts Go backend and Vite frontend, restarts backend on Go file changes, installs frontend deps if missing. |
| `scripts/build.ps1` | Windows portable release builder. | Builds frontend, embeds `app/internal/webui/dist`, builds `MediaVault.exe`, copies ffmpeg tools, writes portable config and start/stop scripts. |
| `config/config.json` | Runtime config. | Contains local paths. Do not publish actual path values. |
| `bin/ffmpeg.exe` | Bundled ffmpeg. | Used by preview generation. |
| `bin/ffprobe.exe` | Bundled ffprobe. | Used by scanner metadata extraction. |
| `data/app.db` | SQLite database. | Runtime data; not a source file. |
| `logs/.gitkeep` | Placeholder for logs folder. | No file logger currently writes here. |

## 2. Backend Specification

### 2.1 Backend Location

| Item | Value |
|---|---|
| Backend root path | `app/` |
| Main entrypoint | `app/cmd/server/main.go` |
| Server framework/router | `github.com/go-chi/chi/v5` |
| Default host | `127.0.0.1` |
| Default port | Code default `8090`; current portable/dev config uses `5000`. |
| Config loading method | `config.NewService(rootDir).Load()` reads/writes `config/config.json`; relative paths resolve against root dir. |

### 2.2 Backend Folder Structure

```text
app/
|-- cmd/server/main.go
|-- internal/
|   |-- api/server.go
|   |-- appfs/paths.go
|   |-- config/config.go
|   |-- db/db.go
|   |-- library/model.go
|   |-- library/repository.go
|   |-- media/
|   |   |-- deletion/service.go
|   |   |-- metadata/ffprobe.go
|   |   |-- organizer/service.go
|   |   |-- previews/service.go
|   |   `-- scanner/scanner.go
|   |-- metadata/model.go
|   |-- metadata/repository.go
|   |-- static/static.go
|   `-- webui/webui.go
`-- migrations/
```

### 2.3 Backend Packages / Modules

| Package/Folder | Responsibility |
|---|---|
| `app/cmd/server` | Resolves app root, loads config, opens DB, wires repositories/services, starts HTTP server. |
| `app/internal/api` | Registers all JSON, stream, preview, settings, scan, metadata, and file-action routes. |
| `app/internal/config` | Runtime config model, defaults, load/save, relative path resolution. |
| `app/internal/db` | SQLite open, schema initialization, in-code migrations, indexes. |
| `app/internal/library` | Media item model and SQL repository for listing, search, update, delete, episode navigation. |
| `app/internal/metadata` | Company/person/category/tag/series models and repositories, assignment replacement, bulk assignment. |
| `app/internal/media/scanner` | Recursive source folder scanner and ffprobe integration. |
| `app/internal/media/metadata` | `ffprobe` wrapper and JSON parsing. |
| `app/internal/media/previews` | Thumbnail and hover clip generation, preview job state, cache freshness. |
| `app/internal/media/organizer` | Managed move-to-library service and async move job state. |
| `app/internal/media/deletion` | File deletion and DB-only cleanup service. |
| `app/internal/system/actions` | Host OS actions: open VLC, reveal file in Explorer. |
| `app/internal/webui` | Embedded SPA file server and `/api/` dispatch. |
| `app/internal/static` | Separate embedded `dist` FS declaration; currently not wired by server. |
| `app/internal/appfs` | `FirstExisting` helper; currently not used by main flow. |

### 2.4 Server Startup Flow

1. `main()` in `app/cmd/server/main.go` calls `resolveRootDir()` using cwd, parent cwd, executable dir, and executable parent.
2. `config.NewService(rootDir)` creates a service targeting `config/config.json`.
3. `cfgService.Load()` creates `config/`, `data/`, and `logs/`, creates defaults if config is missing, and fills fallback values.
4. `db.Open(rootDir)` opens `data/app.db` with WAL, busy timeout, and foreign keys; `ensureSchema()` creates tables and indexes.
5. Repositories are created: `library.NewRepository(sqliteDB)` and `metadata.NewRepository(sqliteDB)`.
6. Services are created: scanner, organizer, previews, deletion, and system actions.
7. `api.NewRouter(&api.Server{...})` registers all routes in `app/internal/api/server.go`.
8. `webui.NewHandler(router)` creates an embedded SPA handler from `app/internal/webui/dist`.
9. `http.ListenAndServe(cfg.Server.Host + ":" + cfg.Server.Port, handler)` starts the local server.

Background workers are started only on demand: preview jobs after scans/regeneration and move jobs after move-start endpoints. There is no always-on watcher or scheduled scanner.

### 2.5 API Routes Inventory

All routes are registered in `app/internal/api/server.go`. Auth is not implemented, so `Auth Required?` is `No` for every route.

| Domain | Method | Path | Handler / Service | Request Body | Response | Auth Required? | Notes |
|---|---|---|---|---|---|---|---|
| Health | GET | `/api/health` | inline | none | `{ ok: true }` | No | Liveness only. |
| Settings | GET | `/api/settings` | `ConfigService.Load` | none | `config.AppConfig` | No | Returns configured path values. |
| Settings | PUT | `/api/settings` | `ConfigService.Save` | `config.AppConfig` | `{ ok, settings }` | No | Normalizes default host/port/tool paths. |
| Scanner | POST | `/api/scan/run` | `Scanner.ScanAll`, `Previewer.StartWarmup` | none | scan summary + `preview_job` | No | Synchronous scan, async preview warmup. |
| Preview | GET | `/api/previews/progress` | `Previewer.GetWarmupStatus` | none | `{ job }` | No | Current preview job only. |
| Preview | POST | `/api/previews/regenerate` | `Previewer.StartJob` | `{ media_ids, target }` | `{ ok, job }` | No | `target` is `thumbnails` or `hovers`. |
| Library | GET | `/api/library` | `LibraryRepo.List` | query: `q`, `media_type`, `tagged_status`, `limit`, `offset` | `{ items, total, limit, offset, tagged_status }` | No | Limits max to 500. |
| Library | GET | `/api/library/{id}` | `LibraryRepo.GetByID`, `MetadataRepo.GetAssignments` | none | `{ item, assignments }` | No | Detail drawer payload. |
| Library | PATCH | `/api/library/{id}` | `LibraryRepo.UpdateEditable` | `UpdateEditableInput` | `{ ok, item, assignments }` | No | Marks title/type/sequence source as manual. |
| Library tagging | PATCH | `/api/library/{id}/tagging` | `MetadataRepo.ReplaceAssignments` | `UpdateAssignmentsInput` | `{ ok, item, assignments }` | No | Replaces all assignment join rows. |
| Bulk tagging | POST | `/api/library/bulk/tagging` | `MetadataRepo.ApplyBulkAssignments` | media ids and assignment payload | `{ ok, requested, updated }` | No | Adds people/categories/tags, optionally sets company/series. |
| Managed move | POST | `/api/library/{id}/move-to-library` | `Organizer.MoveToLibrary` | none | `{ ok, item, assignments, result }` | No | Synchronous legacy endpoint. |
| Managed move | POST | `/api/library/{id}/move-to-library/start` | `Organizer.StartMoveJob` | none | `{ ok, job }` | No | Async preferred endpoint. |
| Bulk move | POST | `/api/library/bulk/move-to-library` | `Organizer.MoveManyToLibrary` | `{ media_ids }` | bulk summary | No | Synchronous legacy endpoint. |
| Bulk move | POST | `/api/library/bulk/move-to-library/start` | `Organizer.StartMoveJob` | `{ media_ids }` | `{ ok, job }` | No | Async preferred endpoint. |
| Move progress | GET | `/api/moves/progress` | `Organizer.GetCurrentJobStatus` | none | `{ job }` | No | Current move job only. |
| Delete | POST | `/api/library/{id}/delete` | `Deletion.Delete` | `{ mode }` | delete result | No | `mode` is `delete_file` or `db_only`. |
| Player | GET | `/api/library/{id}/player-context` | `LibraryRepo.GetByID`, `GetEpisodeNavigation` | none | `{ item, prev_episode_id, next_episode_id }` | No | Used by `/player/:id`. |
| Thumbnail | GET | `/api/library/{id}/thumbnail` | `Previewer.EnsureThumbnail` | none | JPEG file | No | Generates on demand if missing/stale. |
| Hover preview | GET | `/api/library/{id}/hover-preview` | `Previewer.EnsureHoverClip` | none | MP4 file | No | Generates on demand if missing/stale. |
| Stream | GET | `/api/library/{id}/stream` | inline `http.ServeContent` | none | media bytes | No | Supports range requests through `ServeContent`. |
| VLC | POST | `/api/library/{id}/open-vlc` | `Actions.OpenInVLC` | none | `{ ok }` | No | Host-machine process launch. |
| File action | POST | `/api/library/{id}/reveal-file` | `Actions.RevealInFolder` | none | `{ ok }` | No | Windows Explorer only. |
| Metadata | GET | `/api/metadata/options` | `MetadataRepo.GetOptions` | none | `MetadataOptions` | No | All reusable metadata lists. |
| Metadata | POST | `/api/metadata/companies` | `MetadataRepo.CreateCompany` | `{ name }` | `Company` | No | Returns existing by case-insensitive name. |
| Metadata | POST | `/api/metadata/people` | `MetadataRepo.CreatePerson` | `{ name }` | `Person` | No | Returns existing by case-insensitive name. |
| Metadata | POST | `/api/metadata/categories` | `MetadataRepo.CreateCategory` | `{ name, kind, parent_id }` | `Category` | No | `kind` is `main` or `sub`. |
| Metadata | POST | `/api/metadata/tags` | `MetadataRepo.CreateTag` | `{ name }` | `Tag` | No | Returns existing by case-insensitive name. |
| Metadata | POST | `/api/metadata/series` | `MetadataRepo.CreateSeries` | `{ name, company_id }` | `Series` | No | Existing check includes company. |
| Search | GET | `/api/search/tagged` | `LibraryRepo.SearchTagged` | query filters | paginated result | No | Only returns tagged media. |

### 2.6 API Response Shapes

```ts
type MediaItem = {
  id: number;
  title: string;
  media_type: "movie" | "series_episode" | "video";
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

type MediaDetail = {
  item: MediaItem;
  assignments: {
    company_id: number | null;
    series_id: number | null;
    person_ids: number[];
    category_ids: number[];
    tag_ids: number[];
  };
};

type Company = { id: number; name: string; created_at?: string; updated_at?: string };
type Person = { id: number; name: string; created_at?: string; updated_at?: string };
type Category = {
  id: number;
  name: string;
  kind: "main" | "sub";
  parent_id: number | null;
  parent_name: string;
  created_at?: string;
  updated_at?: string;
};
type Tag = { id: number; name: string; created_at?: string; updated_at?: string };
type Series = {
  id: number;
  name: string;
  company_id: number | null;
  company_name: string;
  created_at?: string;
  updated_at?: string;
};

type ScanResult = {
  sources: number;
  files_seen: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  preview_job?: PreviewGenerationJob | null;
};

type PreviewGenerationJob = {
  id: string;
  job_type: string;
  generate_thumbs: boolean;
  generate_hovers: boolean;
  force_regenerate: boolean;
  status: string;
  total_items: number;
  total_steps: number;
  completed_steps: number;
  succeeded_steps: number;
  failed_steps: number;
  progress_percent: number;
  current_item_id: number;
  current_title: string;
  current_stage: string;
  errors: string[];
  started_at: string;
  finished_at: string;
};

type AppSettings = {
  server: { host: string; port: number };
  paths: {
    sources: string[];
    library_root: string;
    views_root: string;
    preview_cache: string;
  };
  tools: { ffmpeg: string; ffprobe: string; vlc: string };
  mode: { portable: boolean };
};
```

### 2.7 Backend Error Handling

| Area | Current Behavior | File/Function | Notes |
|---|---|---|---|
| API errors | JSON `{ "error": string }` for most JSON routes. | `app/internal/api/server.go` inline handlers | Status codes vary by handler. |
| Stream/preview errors | Plain `http.Error` text. | thumbnail, hover-preview, stream handlers | Frontend image/video failures are not normalized as JSON. |
| DB errors | Returned to API and often exposed as `err.Error()`. | repositories and `api/server.go` | Useful but can leak local path details in some cases. |
| File missing | Usually 404 for read/stream; 409 for delete-file missing. | `Deletion.Delete`, stream handler, actions | DB-only cleanup can remove missing-file rows. |
| Permission errors | Returned as operation errors. | deletion, organizer, actions | No specialized permission classification. |
| ffmpeg/ffprobe errors | Include command error and combined output for ffmpeg; ffprobe scanner adds path and error to scan summary. | `media/previews/service.go`, `media/scanner/scanner.go` | ffmpeg output may be verbose. |
| VLC errors | Bad request JSON error. | `Actions.OpenInVLC`, `/open-vlc` route | Validates VLC executable and media file before `cmd.Start()`. |

Logging uses Go `log` at startup and server listen/fatal paths only. No structured logger, request logging, scan log file, or log-level system exists.

### 2.8 Backend Logging

| Logger | Location | Output | Notes |
|---|---|---|---|
| Standard library `log` | `app/cmd/server/main.go` | Console | Startup, fatal config/DB/web handler/server failures. |
| MISSING structured app logger | MISSING | MISSING | No log levels, no request IDs, no log files. |
| MISSING scan log persistence | MISSING | MISSING | Scan errors are returned to caller, not stored as history. |

## 3. Database Specification

### 3.1 Database Location And Lifecycle

| Item | Value |
|---|---|
| Database type | SQLite |
| Database file path | `data/app.db` under resolved root |
| Created by | `db.Open(rootDir)` in `app/internal/db/db.go` |
| Migrations location | `app/migrations/` exists but is unused/empty in current implementation. |
| Schema initialization location | `ensureSchema()` in `app/internal/db/db.go` |
| Backup/export support | MISSING |

SQLite DSN enables `journal_mode(WAL)`, `busy_timeout(5000)`, and `foreign_keys(1)`.

### 3.2 Tables

#### Table: `media_items`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | INTEGER | No | autoincrement | Primary key. |
| `title` | TEXT | No | none | Required display title. |
| `media_type` | TEXT | No | `video` | `video`, `movie`, or `series_episode` by convention. |
| `source_path` | TEXT | No | none | Unique original/current path for reference items. |
| `canonical_path` | TEXT | No | empty string | Managed/current path if moved. |
| `file_name` | TEXT | No | empty string | Basename. |
| `extension` | TEXT | No | empty string | Lowercase extension. |
| `duration_seconds` | REAL | No | `0` | From ffprobe. |
| `width` | INTEGER | No | `0` | From first video stream. |
| `height` | INTEGER | No | `0` | From first video stream. |
| `video_codec` | TEXT | No | empty string | From first video stream. |
| `audio_codec` | TEXT | No | empty string | From first audio stream. |
| `filesize_bytes` | INTEGER | No | `0` | Max of ffprobe size and filesystem size. |
| `season_number` | INTEGER | No | `0` | Auto parsed from `SxxExx` or manual. |
| `episode_number` | INTEGER | No | `0` | Auto parsed from `SxxExx` or manual. |
| `type_source` | TEXT | No | `auto` | `manual` values survive rescan. |
| `title_source` | TEXT | No | `auto` | `manual` values survive rescan. |
| `sequence_source` | TEXT | No | `auto` | `manual` values survive rescan. |
| `company_id` | INTEGER | Yes | `NULL` | No foreign key declared in schema. |
| `series_id` | INTEGER | Yes | `NULL` | No foreign key declared in schema. |
| `created_at` | TEXT | No | none / migration empty | UTC RFC3339 in repository writes. |
| `updated_at` | TEXT | No | none / migration empty | UTC RFC3339 in repository writes. |

Indexes: `idx_media_items_media_type`, `idx_media_items_title`, `idx_media_items_updated_at`, `idx_media_items_company_id`, `idx_media_items_series_id`. Unique constraint: `source_path`.

#### Table: `companies`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | INTEGER | No | autoincrement | Primary key. |
| `name` | TEXT | No | none | Unique, but SQLite unique is case-sensitive; repository also checks case-insensitively. |
| `created_at` | TEXT | No | none | UTC RFC3339. |
| `updated_at` | TEXT | No | none | UTC RFC3339. |

#### Table: `people`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | INTEGER | No | autoincrement | Primary key. |
| `name` | TEXT | No | none | Unique, with case-insensitive existing check in repository. |
| `created_at` | TEXT | No | none | UTC RFC3339. |
| `updated_at` | TEXT | No | none | UTC RFC3339. |

#### Table: `categories`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | INTEGER | No | autoincrement | Primary key. |
| `name` | TEXT | No | none | Not globally unique. |
| `kind` | TEXT | No | none | `main` or `sub`. |
| `parent_id` | INTEGER | Yes | `NULL` | FK to `categories(id)` with `ON DELETE SET NULL`. |
| `created_at` | TEXT | No | none | UTC RFC3339. |
| `updated_at` | TEXT | No | none | UTC RFC3339. |

Indexes: `idx_categories_kind`, `idx_categories_parent_id`.

#### Table: `tags`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | INTEGER | No | autoincrement | Primary key. |
| `name` | TEXT | No | none | Unique, with case-insensitive existing check in repository. |
| `created_at` | TEXT | No | none | UTC RFC3339. |
| `updated_at` | TEXT | No | none | UTC RFC3339. |

#### Table: `series`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | INTEGER | No | autoincrement | Primary key. |
| `name` | TEXT | No | none | Existing check includes `company_id`. |
| `company_id` | INTEGER | Yes | `NULL` | FK to `companies(id)` with `ON DELETE SET NULL`. |
| `created_at` | TEXT | No | none | UTC RFC3339. |
| `updated_at` | TEXT | No | none | UTC RFC3339. |

Index: `idx_series_company_id`.

#### Join Tables

| Table | Columns | Primary Key | Relationships |
|---|---|---|---|
| `media_people` | `media_id INTEGER NOT NULL`, `person_id INTEGER NOT NULL` | `(media_id, person_id)` | FKs to `media_items` and `people`, both `ON DELETE CASCADE`. |
| `media_categories` | `media_id INTEGER NOT NULL`, `category_id INTEGER NOT NULL` | `(media_id, category_id)` | FKs to `media_items` and `categories`, both `ON DELETE CASCADE`. |
| `media_tags` | `media_id INTEGER NOT NULL`, `tag_id INTEGER NOT NULL` | `(media_id, tag_id)` | FKs to `media_items` and `tags`, both `ON DELETE CASCADE`. |

Indexes: `idx_media_people_media_id`, `idx_media_categories_media_id`, `idx_media_tags_media_id`.

### 3.3 Core Data Model Summary

| Concept | Table(s) | Notes |
|---|---|---|
| Media item | `media_items` | One row per unique `source_path`. |
| Canonical file path | `media_items.canonical_path` | Empty for reference mode; set to target path after managed move. |
| Movie | `media_items.media_type = 'movie'` | Manual only unless user changes type; scanner defaults non-episode to `video`. |
| Series | `series`, `media_items.series_id` | Series metadata exists; no dedicated series manager route beyond create/list through options. |
| Season | `media_items.season_number` | No season table. |
| Episode | `media_items.episode_number`, `media_type='series_episode'` | Parsed from `SxxExx` or manually edited. |
| Company | `companies`, `media_items.company_id`, `series.company_id` | Series company can auto-resolve media company during assignment. |
| Actor/Performer | `people`, `media_people` | Named `people` in backend/frontend types. |
| Category | `categories(kind='main')`, `media_categories` | Main categories are top-level rows. |
| Sub-category | `categories(kind='sub', parent_id=...)` | No DB constraint that parent is `main`; repository enforces on create only partially by requiring a parent. |
| Free tag | `tags`, `media_tags` | Generic tags. |
| Preview thumbnail | Files in preview cache, no DB table | Path is `{preview_cache}/thumbs/{media_id}.jpg`. |
| Preview clip | Files in preview cache, no DB table | Path is `{preview_cache}/hover/{media_id}.mp4`. |
| Generated folder view | MISSING | `views_root` exists in config but no generator/service/route found. |
| Scan result/history | MISSING | Only one request response; no table. |
| Settings | `config/config.json` | Not stored in DB. |

### 3.4 Database Access Pattern

- Package: `app/internal/db` opens DB, `app/internal/library` and `app/internal/metadata` perform SQL access.
- Query style: raw SQL through `sqlx`.
- Transactions: metadata assignment replacement and bulk apply use explicit transactions. Most other operations use direct statements.
- Connections: one `*sqlx.DB` handle shared across repositories.
- WAL: enabled in DSN.
- Migrations: in-code column checks in `migrateMediaItemsTable`; no versioned migration framework.
- Missing/orphan files: no database status flag. File absence is discovered when stream/delete/open/move tries to access the path.

### 3.5 Data Integrity Rules

- One media item maps to one unique `source_path`.
- Duplicate detection is based on `source_path`, not hash, file size, or canonical path.
- Existing item update behavior preserves manual title/type/sequence fields during rescans.
- Missing files are not marked during scan; there is no orphan detection pass.
- DB-only cleanup deletes the media row and cascades join-table rows; the physical file remains and can return after rescan.
- File deletion deletes resolved current path, deletes DB row, and removes preview cache artifacts.
- Re-scan behavior upserts by source path and starts preview warmup for processed IDs.

## 4. Media Scanning And File Management

### 4.1 Source Folder Scanning

| Item | Current Behavior |
|---|---|
| Recursive scan supported? | Yes, via `filepath.WalkDir` in `Scanner.ScanAll`. |
| File extensions supported | `.mp4`, `.mkv`, `.avi`, `.mov`, `.wmv`, `.m4v`, `.webm`, `.flv`, `.mpeg`, `.mpg`, `.ts`. |
| Hidden files ignored? | No explicit hidden-file check. Unsupported extensions are skipped. |
| Duplicate handling | `media_items.source_path` unique; `Upsert` updates existing rows. |
| Existing item update behavior | Updates technical metadata; preserves manual title/type/sequence fields. |
| Missing file detection | MISSING as a scan feature. |
| Error handling | Per-source/file errors collected in `Summary.Errors`; scan continues. |

### 4.2 Scan Flow

1. `/api/scan/run` calls `Scanner.ScanAll(context.Background())`.
2. `ScanAll` loads config and validates resolved `tools.ffprobe`.
3. Each configured source is resolved and validated as a directory.
4. `filepath.WalkDir` recursively visits files.
5. Unsupported extensions increment `Skipped`; supported files increment `FilesSeen`.
6. `metadata.Probe(ffprobePath, path)` runs ffprobe and extracts duration, streams, title tag, size.
7. Scanner derives title from ffprobe title or basename, parses `SxxExx`, and infers media type.
8. `LibraryRepo.Upsert` inserts/updates `media_items`.
9. `/api/scan/run` starts `Previewer.StartWarmup(summary.ProcessedMediaIDs)`.

### 4.3 Reference Mode

| Item | Current Behavior |
|---|---|
| Is implemented? | Yes, as default scan behavior. |
| Where configured | Implicit; `mode.portable` exists but no explicit `reference` flag. |
| File move behavior | None during scan. |
| Path storage behavior | `source_path` stores original path; `canonical_path` remains empty. |

### 4.4 Managed Mode

| Item | Current Behavior |
|---|---|
| Is implemented? | Partial. Move-to-library is implemented; generated views are not. |
| Where configured | `paths.library_root` in config/settings. |
| Destination structure | `movies/{company}/{file}`, `series/{company}/{series}/Season NN/{file}`, `videos/{company}/{file}`. Missing names use `_No Company` or `_No Series`. |
| Move/copy behavior | First tries `os.Rename`; on failure copies then removes source. |
| Conflict behavior | Appends ` (n)` to target filename up to 9999 attempts. |
| Rollback behavior | MISSING; if DB update fails after file move, no rollback restores the file. |

### 4.5 File Actions

| Action | API/Function | Current Behavior | Safety Notes |
|---|---|---|---|
| Reveal in folder | `POST /api/library/{id}/reveal-file`, `Actions.RevealInFolder` | Starts `explorer.exe /select, <path>`. | Windows-only, host-machine action, no auth. |
| Delete physical file | `POST /api/library/{id}/delete`, `Deletion.Delete` with `delete_file` | Deletes resolved current path, deletes DB row, removes preview cache. | Permanent, no auth, no recycle bin. |
| Remove DB record only | Same route with `db_only` | Deletes DB row only. | Rescan can add the file back if still in source. |
| Rebuild generated views | MISSING | No implementation found. | README lists this as a feature, but code does not. |
| Move/rename | Move-to-library endpoints, `Organizer` | Moves into managed library root. | No generic rename endpoint. |

## 5. Media Metadata And Preview Generation

### 5.1 ffprobe Integration

| Item | Value |
|---|---|
| ffprobe path source | `config.AppConfig.Tools.FFprobe`, default `./bin/ffprobe.exe`. |
| Wrapper function/file | `metadata.Probe` in `app/internal/media/metadata/ffprobe.go`. |
| Metadata extracted | format title tag, duration, format size, first video codec/width/height, first audio codec. |
| Failure behavior | Scanner records `ffprobe failed: <path>: <error>` and continues. |

### 5.2 ffmpeg Integration

| Item | Value |
|---|---|
| ffmpeg path source | `config.AppConfig.Tools.FFmpeg`, default `./bin/ffmpeg.exe`. |
| Wrapper function/file | `previews.Service` in `app/internal/media/previews/service.go`. |
| Thumbnail generation implemented? | Yes, one 640x360 JPG per media ID. |
| Preview clip generation implemented? | Yes, 5 sampled 1.3s clips concatenated to silent 640x360 MP4 at 12fps. |
| Cache path | `paths.preview_cache`, default `./data/previews`; subfolders `thumbs/` and `hover/`. |
| Regeneration behavior | Freshness check compares source and output mod times unless force regeneration is requested. |

### 5.3 Thumbnail And Preview URLs

| Asset | Backend source | URL/API | Cache behavior |
|---|---|---|---|
| Thumbnail | `Previewer.EnsureThumbnail` | `/api/library/{id}/thumbnail` | Generated on demand, cached with `Cache-Control: public, max-age=86400`. |
| Hover clip | `Previewer.EnsureHoverClip` | `/api/library/{id}/hover-preview` | Generated on demand, cached with same header. |
| Poster/backdrop | MISSING | MISSING | Not implemented. |

## 6. Playback Specification

### 6.1 Browser Playback

| Item | Current Behavior |
|---|---|
| API route | `GET /api/library/{id}/stream` |
| Streaming/range requests supported? | Yes, through `http.ServeContent`. |
| MIME type handling | Uses `mime.TypeByExtension(filepath.Ext(path))` if known. |
| Supported formats | Whatever the browser can play from the scanned extensions. Backend does not transcode. |
| Large file behavior | File is opened and served through `ServeContent`; no custom throttling or transcoding. |
| Remote client behavior | Technically streamable if server is reachable, but host defaults to `127.0.0.1` and no auth/LAN mode exists. |

### 6.2 VLC Playback

| Item | Current Behavior |
|---|---|
| API route / function | `POST /api/library/{id}/open-vlc`, `Actions.OpenInVLC`. |
| VLC path config | `tools.vlc` in `config/config.json` / Settings UI. |
| Host-machine only? | Yes. It launches a process on the server host. |
| Error behavior | JSON 400 with error if VLC path missing, executable missing, media path empty, or file missing. |
| OS support | Windows path/config and Explorer reveal are Windows-specific; VLC launch uses configured executable. |
| Remote/LAN limitations | Remote browser would trigger VLC on host, not client. Needs LAN/auth/device capability design later. |

### 6.3 Player UI Dependencies

| Dependency | Used? | Location |
|---|---|---|
| Native HTML video | Yes | `app/web/src/features/player/player-page.tsx` |
| Custom controls | No | Browser native controls only. |
| Third-party player library | No | None in package dependencies. |

## 7. Frontend Specification

### 7.1 Frontend Location

| Item | Value |
|---|---|
| Frontend root path | `app/web/` |
| Framework | React + Vite + TypeScript |
| Package manager | npm |
| Main entrypoint | `app/web/src/main.tsx` |
| Router | `react-router-dom` `BrowserRouter` in `app/web/src/root-app.tsx` |
| State management | Local React state/hooks; `@tanstack/react-query` provider exists but current data fetching uses manual `apiFetch`. |
| Styling approach | Tailwind v4 plus global CSS custom properties in `app/web/src/styles.css`. |
| UI library | Local UI primitives in `app/web/src/components/ui/`. `components.json` exists for shadcn-style config. |
| Icon library | MISSING; no icon dependency found. |

### 7.2 Frontend Folder Structure

```text
app/web/
|-- package.json
|-- vite.config.ts
|-- components.json
|-- src/
|   |-- main.tsx
|   |-- App.tsx
|   |-- root-app.tsx
|   |-- styles.css
|   |-- types.ts
|   |-- app/
|   |   |-- layout/
|   |   `-- providers/
|   |-- components/
|   |   |-- ui/
|   |   `-- legacy component wrappers/files
|   |-- features/
|   |   |-- dashboard/
|   |   |-- library/
|   |   |-- metadata/
|   |   |-- notifications/
|   |   |-- player/
|   |   |-- search/
|   |   `-- settings/
|   |-- lib/api.ts
|   `-- pages/
|-- public/
`-- docs/
```

### 7.3 Pages / Routes

| Route | Page Component | Purpose | API Calls |
|---|---|---|---|
| `/` | `DashboardPage` | Main dashboard shell with tabs for library, search, metadata, settings. | Settings, metadata options, library, scan, preview/move progress, CRUD actions. |
| `/?tab=library` | `LibraryPage` inside dashboard | Scan, filter, select, preview, open detail/player. | `/api/library`, `/api/scan/run`, preview routes, move routes. |
| `/?tab=search` | `TaggedSearchPage` | Advanced search over tagged media only. | `/api/search/tagged`, preview image/video URLs, VLC action. |
| `/?tab=metadata` | `MetadataPage` | Create reusable metadata entities. | `/api/metadata/*`. |
| `/?tab=settings` | `SettingsPage` | Edit sources, paths, tool paths. | `/api/settings`. |
| `/player/:id` | `PlayerPage` | Browser playback and prev/next episode navigation. | `/api/library/{id}/player-context`, `/api/library/{id}/stream`. |

### 7.4 Component Inventory

| Component | Path | Purpose | Status |
|---|---|---|---|
| `DashboardPage` | `app/web/src/features/dashboard/dashboard-page.tsx` | Main tabbed shell and drawer orchestration. | Keep |
| `useDashboardController` | `app/web/src/features/dashboard/use-dashboard-controller.ts` | Main frontend data/state/actions. | Keep/refactor later for size |
| `DashboardShell`, header/sidebar/dock | `app/web/src/app/layout/` | App layout and notifications. | Keep |
| `LibraryPage` | `app/web/src/features/library/library-page.tsx` | Library controls and grid. | Keep |
| `LibraryCard` | `app/web/src/features/library/library-card.tsx` | Media card with thumbnail/hover preview/VLC/player. | Keep/refactor visual details |
| `MediaDetailDrawer` | `app/web/src/features/library/media-detail-drawer.tsx` | Detail, edit, tagging, move, delete, tool actions. | Keep/refactor for density |
| `BulkTagDrawer` | `app/web/src/features/library/bulk-tag-drawer.tsx` | Bulk metadata assignment. | Keep |
| `TaggedSearchPage` | `app/web/src/features/search/tagged-search-page.tsx` | Filtered tagged search. | Keep |
| `SearchResultCard` | `app/web/src/features/search/search-result-card.tsx` | Search result card. | Keep |
| `MetadataPage` | `app/web/src/features/metadata/metadata-page.tsx` | Metadata creation views. | Keep |
| `SettingsPage` | `app/web/src/features/settings/settings-page.tsx` | Config editing. | Keep |
| `PlayerPage` | `app/web/src/features/player/player-page.tsx` | Native video player page. | Keep |
| `PreviewJobNotification` | `app/web/src/features/notifications/preview-job-notification.tsx` | Preview job progress UI. | Keep |
| `MoveJobNotification` | `app/web/src/features/notifications/move-job-notification.tsx` | Move job progress UI. | Keep |
| `components/ui/*` | `app/web/src/components/ui/` | Local Button/Card/Input/Select/Badge/Alert primitives. | Keep |
| Legacy components | `app/web/src/components/*.tsx`, `app/web/src/pages/*.tsx` | Older/pre-redesign component copies. | Refactor/delete after confirming no imports |
| Legacy monolith | `app/web/src/App.tsx` | Re-exports root app; contains huge commented legacy implementation. | Clean up later |

### 7.5 API Client

| Item | Value |
|---|---|
| API client file(s) | `app/web/src/lib/api.ts` |
| Fetch library | native `fetch` |
| Base URL handling | Relative URLs; Vite proxies `/api` to `http://127.0.0.1:5000` in dev. |
| Error handling | Non-OK throws `Error("Request failed: ... - <body>")`; JSON parse errors throw. |
| Types location | `app/web/src/types.ts` |

Representative API usage is centralized in `useDashboardController`, `TaggedSearchPage`, `PlayerPage`, and `LibraryCard`.

### 7.6 Current Styling Inventory

| Styling Method | Location | Notes |
|---|---|---|
| Global CSS | `app/web/src/styles.css` | Theme variables, primitives, layout classes, component classes. |
| Tailwind | Throughout TSX; `@import "tailwindcss"` in styles. | Vite plugin `@tailwindcss/vite`. |
| CSS Modules | MISSING | None found. |
| Component library styles | Local classes for UI primitives. | No external UI CSS library. |
| Inline styles | Progress widths and a few dynamic styles. | Normal for progress bars. |

Problems:

- `App.tsx` contains a large commented legacy implementation, increasing noise.
- Duplicate legacy component paths exist under `src/components` and `src/pages`.
- No icon library is installed despite UI actions that would benefit from icons.
- Current palette is dark and warm/blue; visually improved, but still uses many large rounded cards.

### 7.7 Current UI Problems

| Problem | Location | Severity | Notes |
|---|---|---|---|
| Legacy duplicate component tree | `app/web/src/components`, `app/web/src/pages`, commented `App.tsx` | Medium | Can confuse future edits/imports. |
| No visual QA recorded in repo | MISSING | Medium | No Playwright/E2E screenshots or UI regression tests. |
| No missing-file status in UI | Library/detail | Medium | Backend has no missing-file flag; errors occur only on actions. |
| Settings exposes raw path values | `SettingsPage`, `/api/settings` | Medium | Fine for local-only, risky for LAN. |
| Native browser playback only | `PlayerPage` | Low/Medium | No resume/history/custom controls. |

### 7.8 Frontend State And Data Flow

- Media list loads through `useDashboardController.loadLibrary()` from `/api/library?limit=200&media_type&tagged_status`.
- Library search text is stored in URL query param `lib_q`, then filtered client-side against the loaded page.
- Active tab and filters are stored in URL query params.
- Selected media detail loads through `/api/library/{id}` and is stored in `selectedDetail`.
- Metadata edits submit through `PATCH /api/library/{id}` and `PATCH /api/library/{id}/tagging`, then refresh library.
- Scan status is only request-level summary plus preview job polling. No active scanner progress endpoint exists.
- Preview job polling hits `/api/previews/progress` every second while running.
- Move job polling hits `/api/moves/progress` every 800ms while running.
- Playback state is native video state and does not survive refresh.
- Theme persists in `localStorage` key `mediavault-theme`; dismissed job notifications persist in `sessionStorage`.

## 8. Configuration And Environment

### 8.1 Config Files

| Path | Purpose | Sensitive? | Notes |
|---|---|---|---|
| `config/config.json` | Runtime server, path, tool, portable-mode config. | Yes | Contains local absolute paths. Document key names only. |
| `app/web/vite.config.ts` | Vite dev server config and API proxy. | No | Host `127.0.0.1`, port `5173`, proxy `/api` to backend port `5000`. |
| `app/web/package.json` | Frontend deps/scripts. | No | npm scripts. |
| `app/go.mod` | Go module and deps. | No | Module name `mediavault`. |
| `app/web/components.json` | UI component config. | No | shadcn-style metadata. |

### 8.2 Environment Variables

| Variable | Purpose | Required? | Default |
|---|---|---|---|
| `CGO_ENABLED` | Set during release build. | No | `scripts/build.ps1` sets `0` for `go build`. |

No runtime environment variable loading was found.

### 8.3 Runtime Paths

| Path Type | Current Location | Configurable? | Notes |
|---|---|---|---|
| Source folders | `paths.sources` | Yes | Current config contains local user paths; omitted here. |
| Destination library | `paths.library_root` | Yes | Used by organizer only. |
| Generated views | `paths.views_root` | Yes | Configurable but unused. |
| Preview cache | `paths.preview_cache` | Yes | Default `./data/previews`. |
| SQLite DB | `data/app.db` | No | Hard-coded under root dir. |
| Logs | `logs/` | No | Directory created; no writer. |
| VLC executable | `tools.vlc` | Yes | Optional. |
| ffmpeg executable | `tools.ffmpeg` | Yes | Default `./bin/ffmpeg.exe`. |
| ffprobe executable | `tools.ffprobe` | Yes | Default `./bin/ffprobe.exe`. |

## 9. Build, Run, And Packaging

### 9.1 Development

| Task | Command | Working Directory | Notes |
|---|---|---|---|
| Backend dev | `go run ./cmd/server` | `app/` | Uses embedded UI; requires `app/internal/webui/dist` for non-API pages. |
| Frontend dev | `npm run dev` | `app/web/` | Vite on `127.0.0.1:5173`, proxies `/api`. |
| Full app dev | `.\scripts\dev.ps1` | repo root | Starts both, restarts backend on Go changes. |

### 9.2 Production Build

| Task | Command | Output |
|---|---|---|
| Frontend build | `npm run build` | `app/web/dist` |
| Embed frontend | `scripts/build.ps1` copy step | `app/internal/webui/dist` |
| Backend build | `go build -trimpath -ldflags "-s -w" -o release/MediaVault/MediaVault.exe ./cmd/server` | `release/MediaVault/MediaVault.exe` |
| Package app | `.\scripts\build.ps1` | `release/MediaVault/` portable bundle |

### 9.3 Windows Runtime Layout

```text
release/MediaVault/
|-- MediaVault.exe
|-- Start-MediaVault.bat
|-- Stop-MediaVault.bat
|-- README-First-Run.txt
|-- bin/
|   |-- ffmpeg.exe
|   `-- ffprobe.exe
|-- config/
|   `-- config.json
|-- data/
|   `-- previews/
`-- logs/
```

`Start-MediaVault.bat` starts the exe and opens `http://127.0.0.1:5000` after polling `/api/health`.

## 10. Security And LAN Readiness

This is documentation only. No authentication has been implemented here.

### 10.1 Current Exposure

| Item | Current Behavior |
|---|---|
| Server binds to | Configured host; default code `127.0.0.1`, current release/dev config `127.0.0.1`. |
| CORS policy | No CORS middleware. Same-origin in production; Vite proxy in dev. |
| Auth required? | No. |
| CSRF protection? | No. |
| Local network accessible? | Not by default because host is loopback, but configurable host could expose it. |
| File APIs protected? | No. |
| Delete APIs protected? | No. |

### 10.2 Sensitive Operations

| Operation | Route/Function | Risk |
|---|---|---|
| Delete physical file | `POST /api/library/{id}/delete`, `Deletion.Delete` | High |
| Open VLC / launch process | `POST /api/library/{id}/open-vlc`, `Actions.OpenInVLC` | High |
| Reveal folder/path | `POST /api/library/{id}/reveal-file`, `Actions.RevealInFolder` | Medium/High |
| Scan arbitrary folder | `PUT /api/settings` + `POST /api/scan/run` | High |
| Change settings paths | `PUT /api/settings` | High |
| Stream media | `GET /api/library/{id}/stream` | Medium/High |
| Edit metadata | `PATCH /api/library/{id}`, `/tagging`, metadata create routes | Medium |
| Move files | move-to-library endpoints | High |

### 10.3 LAN/Auth Gaps

| Gap | Current Risk | Needed Later |
|---|---|---|
| No authentication/session model | Any exposed client can mutate files/settings. | Login/session or token auth. |
| No CSRF protection | Browser-triggerable POST/PUT/PATCH if exposed. | CSRF strategy or same-site authenticated API design. |
| Host file paths returned to frontend | Leaks local filesystem structure. | Redaction or permission-aware detail fields. |
| Host-only VLC/reveal actions | Remote users can launch host apps. | Device capability checks and host-only controls. |
| No authorization boundaries | All users would be admins. | Roles or local admin-only mode. |
| No HTTPS/LAN config profile | Unsafe remote exposure. | Explicit LAN mode with warnings and secure defaults. |

## 11. Known Technical Debt

| Area | Issue | Impact | Recommended Fix |
|---|---|---|---|
| DB migrations | Schema lives in code; `app/migrations/` unused. | Harder controlled upgrades. | Add versioned migrations or document in-code migration policy. |
| Managed move | No rollback after successful file move but failed DB update. | File/DB inconsistency possible. | Add transactional move state or compensating rollback. |
| Generated views | README/config mention views, no implementation. | User expectations mismatch. | Implement or remove from UI/docs until ready. |
| Scan history/missing files | No persistent scan records or missing-file status. | Hard to audit and clean stale records. | Add scan history table and missing/orphan detection. |
| Frontend legacy code | Duplicate old components and commented monolith. | Future edits may target wrong files. | Delete or archive legacy files after verifying imports. |
| API errors | Mixed JSON and text errors. | Frontend cannot consistently render errors. | Normalize API error envelope. |
| Security | No auth/CSRF; destructive endpoints unprotected. | Unsafe for LAN. | Add auth before binding beyond loopback. |
| Logging | No structured/file logging. | Debugging scans/actions is harder. | Add logger with redaction and log levels. |
| Tests | Only deletion service tests found. | Scanner/organizer/API/frontend regressions likely. | Add focused backend and frontend tests. |

## 12. Backend Gaps For Frontend Redesign

| Needed For UI | Current Support | Gap | Suggested Endpoint/Change |
|---|---|---|---|
| Media grid thumbnails | Supported via `/thumbnail`. | No placeholder/status; generation may block request. | Add preview availability fields or lightweight preview manifest. |
| Search filters | Basic library filters and tagged advanced search. | Library search loads max 200 then client-filters text; no has-preview/missing filter. | Expand `/api/library` filters and pagination. |
| Active scan status | Only synchronous scan response. | No scan progress endpoint. | Add async scan job and `/api/scan/progress`. |
| Media detail metadata | Supported. | No poster/backdrop/watch history. | Add optional media assets/history later. |
| Browser playback | Supported through range-capable stream. | No resume position, transcoding, or compatibility fallback. | Add watch history/resume and format capability metadata. |
| VLC availability status | Action route validates on click. | No preflight status. | Add `/api/system/capabilities` or `/api/vlc/status`. |
| Missing file status | MISSING. | UI cannot show stale records before action failure. | Add scan/orphan check and `missing` field. |
| Generated folder views | MISSING. | README/settings mention feature. | Add views service/routes or hide setting. |

## 13. Frontend Redesign Integration Notes

### 13.1 Can the UI be redesigned without backend changes?

Answer: Partially.

Notes: The current backend supports library browsing, metadata editing, scan, preview generation, browser playback, VLC, delete, and move workflows. Richer redesign pieces like continue watching, scan progress, missing-file state, generated views, VLC status, and poster/backdrop assets need backend changes.

### 13.2 Which pages can be redesigned immediately?

- Main dashboard shell and navigation.
- Library grid/list around existing `/api/library`.
- Media detail drawer/page around existing detail and tagging APIs.
- Metadata management page.
- Settings page.
- Browser player page.
- Tagged search page.

### 13.3 Which pages need backend/API changes first?

- Continue Watching / Recently Played.
- Scan progress/history page.
- Missing/orphan media cleanup page.
- Generated folder views manager.
- LAN/auth settings.
- VLC capability/status page.

### 13.4 Which old components should be preserved?

- Current `features/*` implementation files.
- Current `components/ui/*` primitives.
- `ThemeProvider` and layout shell.
- Notification components for preview and move jobs.

### 13.5 Which old components should be replaced?

- Legacy `app/web/src/components/*.tsx` duplicates if no longer imported.
- Legacy `app/web/src/pages/*.tsx` duplicates if no longer imported.
- Commented legacy implementation inside `app/web/src/App.tsx`.

## 14. Testing And QA

### 14.1 Existing Tests

| Test Type | Location | Command | Notes |
|---|---|---|---|
| Backend | `app/internal/media/deletion/service_test.go` | `go test ./...` from `app/` | Covers delete file, canonical path delete, DB-only cleanup, missing file conflict. |
| Frontend | MISSING | MISSING | No frontend tests found. |
| E2E | MISSING | MISSING | No Playwright/Cypress tests found. |
| Build validation | `app/web/package.json`, `scripts/build.ps1` | `npm run build`; `.\scripts\build.ps1` | Build scripts exist, not tests. |

### 14.2 Manual Test Checklist

- [ ] Start backend.
- [ ] Start frontend.
- [ ] Add source folder.
- [ ] Run scan.
- [ ] View library.
- [ ] Open media detail.
- [ ] Play in browser.
- [ ] Open in VLC.
- [ ] Edit tags.
- [ ] Delete DB-only record.
- [ ] Handle missing file.
- [ ] Regenerate thumbnails.
- [ ] Regenerate hover previews.
- [ ] Move item to library.
- [ ] Restart app and verify persistence.

### 14.3 Test Media Notes

- Use a small MP4 file.
- Include a nested folder sample.
- Include a filename with `S01E02` to test series episode inference.
- Create a missing-file scenario by indexing then moving/deleting the file outside the app.
- Create a duplicate-path scenario by rescanning the same source; duplicate-by-content in different paths is not detected.
- Do not commit private media files.

## 15. Open Questions

| Question | Current Finding | Needs User Decision? |
|---|---|---|
| Is this app browser-only or packaged desktop? | It is a local web app packaged as a Windows portable folder with `MediaVault.exe` and batch scripts. | Yes, for future distribution UX. |
| Is LAN access already partially enabled? | Only by changing host config; no auth/LAN mode. | Yes |
| Does browser streaming support range requests? | Yes through `http.ServeContent`. | No |
| Is VLC only host-side? | Yes. | No |
| Are generated folder views implemented? | No. `views_root` exists only as config/UI field. | Yes, decide implement vs remove. |
| Is Managed Mode implemented or only planned? | Partially implemented through move-to-library. | Yes, for expected behavior/rollback/views. |
| Are previews generated automatically or on demand? | Both: warmup starts after scan, manual regen exists, and routes generate on demand if missing/stale. | No |
| Does the app have watch history yet? | No. | Yes |

## 16. Final Summary

### Current Architecture

- Go HTTP server with chi routes, SQLite persistence, local JSON config, and embedded React SPA.
- React/Vite frontend uses a dashboard shell with library, tagged search, metadata, settings, and player surfaces.
- ffprobe powers scan metadata; ffmpeg powers thumbnails and hover previews.
- Local filesystem paths are first-class data. The app is currently safest as loopback-only.

### What Works

- Recursive scanning of configured source folders.
- SQLite media catalog with metadata relationships.
- Metadata creation and assignment.
- Library listing, tagged search, detail editing, bulk tagging.
- Thumbnail and hover preview generation.
- Browser playback with range support.
- Host VLC launch and Windows Explorer reveal.
- Managed move-to-library jobs.
- File delete and DB-only cleanup.

### What Is Partially Implemented

- Managed mode: file moving exists, generated views and rollback do not.
- Frontend redesign: feature tree is modernized, but legacy code remains.
- Preview jobs: current job state exists, but no persistent history.
- Settings: paths are editable, but path validation/status is limited.

### What Is Missing

- Authentication, authorization, CSRF protection, LAN readiness.
- Generated folder views.
- Watch history/resume positions.
- Scan progress/history and missing-file/orphan tracking.
- Poster/backdrop assets.
- Versioned DB migrations.
- Frontend/E2E tests and broad backend tests.
- Structured logging.

### Highest Risk Areas

- Destructive unauthenticated endpoints if server is exposed beyond loopback.
- File/DB inconsistency during managed move failures.
- Local path leakage through settings, media detail, and error messages.
- Large scans/previews can be slow and have limited persistent diagnostics.

### Recommended Next Steps

1. Add auth/security design before any LAN binding.
2. Add missing-file/orphan detection and scan job progress/history.
3. Clean legacy frontend files and add minimal UI/build/test coverage.
4. Decide whether generated folder views remain a roadmap item or should be removed from current UI/docs.
5. Harden managed move with rollback or resumable job state.
