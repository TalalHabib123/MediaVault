package api

import (
	"context"
	"encoding/json"
	"errors"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"mediavault/internal/config"
	"mediavault/internal/library"
	"mediavault/internal/media/deletion"
	"mediavault/internal/media/organizer"
	"mediavault/internal/media/previews"
	"mediavault/internal/media/scanner"
	"mediavault/internal/metadata"
	"mediavault/internal/system/actions"
)

type Server struct {
	ConfigService *config.Service
	LibraryRepo   *library.Repository
	MetadataRepo  *metadata.Repository
	Scanner       *scanner.Service
	Organizer     *organizer.Service
	Previewer     *previews.Service
	Deletion      *deletion.Service
	Actions       *actions.Service
}

func NewRouter(s *Server) http.Handler {
	r := chi.NewRouter()

	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok": true,
		})
	})

	r.Get("/api/settings", func(w http.ResponseWriter, r *http.Request) {
		cfg, err := s.ConfigService.Load()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{
				"error": err.Error(),
			})
			return
		}
		writeJSON(w, http.StatusOK, cfg)
	})

	r.Put("/api/settings", func(w http.ResponseWriter, r *http.Request) {
		var payload config.AppConfig
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "invalid json body",
			})
			return
		}

		if strings.TrimSpace(payload.Server.Host) == "" {
			payload.Server.Host = "127.0.0.1"
		}
		if payload.Server.Port == 0 {
			payload.Server.Port = 8090
		}
		if strings.TrimSpace(payload.Paths.PreviewCache) == "" {
			payload.Paths.PreviewCache = "./data/previews"
		}
		if strings.TrimSpace(payload.Tools.FFmpeg) == "" {
			payload.Tools.FFmpeg = "./bin/ffmpeg.exe"
		}
		if strings.TrimSpace(payload.Tools.FFprobe) == "" {
			payload.Tools.FFprobe = "./bin/ffprobe.exe"
		}

		if err := s.ConfigService.Save(&payload); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{
				"error": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"ok":       true,
			"settings": payload,
		})
	})

	r.Post("/api/scan/run", func(w http.ResponseWriter, r *http.Request) {
		summary, err := s.Scanner.ScanAll(context.Background())
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{
				"error": err.Error(),
			})
			return
		}

		if summary.Errors == nil {
			summary.Errors = []string{}
		}

		previewJob := s.Previewer.StartWarmup(summary.ProcessedMediaIDs)

		writeJSON(w, http.StatusOK, map[string]any{
			"sources":     summary.Sources,
			"files_seen":  summary.FilesSeen,
			"inserted":    summary.Inserted,
			"updated":     summary.Updated,
			"skipped":     summary.Skipped,
			"errors":      summary.Errors,
			"preview_job": previewJob,
		})
	})

	r.Get("/api/previews/progress", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"job": s.Previewer.GetWarmupStatus(),
		})
	})

	r.Post("/api/previews/regenerate", func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			MediaIDs []int64 `json:"media_ids"`
			Target   string  `json:"target"`
		}

		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "invalid json body",
			})
			return
		}

		request := previews.JobRequest{
			MediaIDs:        payload.MediaIDs,
			ForceRegenerate: true,
		}

		switch strings.TrimSpace(payload.Target) {
		case "thumbnails":
			request.GenerateThumbs = true
			request.JobType = "regen_thumbnails"
		case "hovers":
			request.GenerateHovers = true
			request.JobType = "regen_hovers"
		default:
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "invalid preview target",
			})
			return
		}

		job := s.Previewer.StartJob(request)
		if job == nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "no media ids provided",
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"ok":  true,
			"job": job,
		})
	})

	r.Get("/api/library", func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		mediaType := strings.TrimSpace(r.URL.Query().Get("media_type"))
		taggedStatus := strings.TrimSpace(r.URL.Query().Get("tagged_status"))

		limit := 100
		offset := 0

		if value := r.URL.Query().Get("limit"); value != "" {
			if parsed, err := strconv.Atoi(value); err == nil {
				limit = parsed
			}
		}

		if value := r.URL.Query().Get("offset"); value != "" {
			if parsed, err := strconv.Atoi(value); err == nil {
				offset = parsed
			}
		}

		items, total, err := s.LibraryRepo.List(q, mediaType, taggedStatus, limit, offset)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{
				"error": err.Error(),
			})
			return
		}

		if items == nil {
			items = []library.MediaItem{}
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"items":         items,
			"total":         total,
			"limit":         limit,
			"offset":        offset,
			"tagged_status": taggedStatus,
		})
	})

	r.Post("/api/library/bulk/tagging", func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			MediaIDs    []int64 `json:"media_ids"`
			SetCompany  bool    `json:"set_company"`
			CompanyID   *int64  `json:"company_id"`
			SetSeries   bool    `json:"set_series"`
			SeriesID    *int64  `json:"series_id"`
			PersonIDs   []int64 `json:"person_ids"`
			CategoryIDs []int64 `json:"category_ids"`
			TagIDs      []int64 `json:"tag_ids"`
		}

		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "invalid json body",
			})
			return
		}

		updated, err := s.MetadataRepo.ApplyBulkAssignments(payload.MediaIDs, metadata.BulkApplyAssignmentsInput{
			SetCompany:  payload.SetCompany,
			CompanyID:   payload.CompanyID,
			SetSeries:   payload.SetSeries,
			SeriesID:    payload.SeriesID,
			PersonIDs:   payload.PersonIDs,
			CategoryIDs: payload.CategoryIDs,
			TagIDs:      payload.TagIDs,
		})
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"ok":        true,
			"requested": len(payload.MediaIDs),
			"updated":   updated,
		})
	})

	r.Post("/api/library/bulk/move-to-library", func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			MediaIDs []int64 `json:"media_ids"`
		}

		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "invalid json body",
			})
			return
		}

		summary, err := s.Organizer.MoveManyToLibrary(payload.MediaIDs)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusOK, summary)
	})

	r.Post("/api/library/bulk/move-to-library/start", func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			MediaIDs []int64 `json:"media_ids"`
		}

		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "invalid json body",
			})
			return
		}

		job, err := s.Organizer.StartMoveJob(payload.MediaIDs)
		if err != nil {
			status := http.StatusBadRequest
			var moveErr *organizer.Error
			if errors.As(err, &moveErr) && moveErr.Status > 0 {
				status = moveErr.Status
			}
			writeJSON(w, status, map[string]any{
				"error": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"ok":  true,
			"job": job,
		})
	})

	r.Get("/api/library/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDParam(chi.URLParam(r, "id"))
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "invalid media id",
			})
			return
		}

		item, err := s.LibraryRepo.GetByID(id)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]any{
				"error": err.Error(),
			})
			return
		}

		assignments, err := s.MetadataRepo.GetAssignments(id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{
				"error": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"item":        item,
			"assignments": assignments,
		})
	})

	r.Patch("/api/library/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDParam(chi.URLParam(r, "id"))
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "invalid media id",
			})
			return
		}

		var payload library.UpdateEditableInput
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "invalid json body",
			})
			return
		}

		if err := s.LibraryRepo.UpdateEditable(id, payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": err.Error(),
			})
			return
		}

		item, err := s.LibraryRepo.GetByID(id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{
				"error": err.Error(),
			})
			return
		}

		assignments, err := s.MetadataRepo.GetAssignments(id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{
				"error": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"ok":          true,
			"item":        item,
			"assignments": assignments,
		})
	})

	r.Patch("/api/library/{id}/tagging", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDParam(chi.URLParam(r, "id"))
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "invalid media id",
			})
			return
		}

		var payload metadata.UpdateAssignmentsInput
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "invalid json body",
			})
			return
		}

		if err := s.MetadataRepo.ReplaceAssignments(id, payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": err.Error(),
			})
			return
		}

		item, err := s.LibraryRepo.GetByID(id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{
				"error": err.Error(),
			})
			return
		}

		assignments, err := s.MetadataRepo.GetAssignments(id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{
				"error": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"ok":          true,
			"item":        item,
			"assignments": assignments,
		})
	})

	r.Post("/api/library/{id}/move-to-library", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDParam(chi.URLParam(r, "id"))
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "invalid media id",
			})
			return
		}

		result, err := s.Organizer.MoveToLibrary(id)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": err.Error(),
			})
			return
		}

		item, err := s.LibraryRepo.GetByID(id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{
				"error": err.Error(),
			})
			return
		}

		assignments, err := s.MetadataRepo.GetAssignments(id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{
				"error": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"ok":          true,
			"item":        item,
			"assignments": assignments,
			"result":      result,
		})
	})

	r.Post("/api/library/{id}/move-to-library/start", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDParam(chi.URLParam(r, "id"))
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "invalid media id",
			})
			return
		}

		job, err := s.Organizer.StartMoveJob([]int64{id})
		if err != nil {
			status := http.StatusBadRequest
			var moveErr *organizer.Error
			if errors.As(err, &moveErr) && moveErr.Status > 0 {
				status = moveErr.Status
			}
			writeJSON(w, status, map[string]any{
				"error": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"ok":  true,
			"job": job,
		})
	})

	r.Get("/api/moves/progress", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"job": s.Organizer.GetCurrentJobStatus(),
		})
	})

	r.Post("/api/library/{id}/delete", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDParam(chi.URLParam(r, "id"))
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "invalid media id",
			})
			return
		}

		var payload struct {
			Mode string `json:"mode"`
		}

		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "invalid json body",
			})
			return
		}

		result, err := s.Deletion.Delete(id, payload.Mode)
		if err != nil {
			status := http.StatusBadRequest
			var deleteErr *deletion.Error
			if errors.As(err, &deleteErr) && deleteErr.Status > 0 {
				status = deleteErr.Status
			}
			writeJSON(w, status, map[string]any{
				"error": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"ok":                    true,
			"media_id":              result.MediaID,
			"mode":                  result.Mode,
			"file_deleted":          result.FileDeleted,
			"preview_cache_cleaned": result.PreviewCacheCleaned,
		})
	})

	r.Get("/api/library/{id}/player-context", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDParam(chi.URLParam(r, "id"))
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "invalid media id",
			})
			return
		}

		item, err := s.LibraryRepo.GetByID(id)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]any{
				"error": err.Error(),
			})
			return
		}

		prevID, nextID, err := s.LibraryRepo.GetEpisodeNavigation(id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{
				"error": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"item":            item,
			"prev_episode_id": prevID,
			"next_episode_id": nextID,
		})
	})

	r.Get("/api/library/{id}/thumbnail", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDParam(chi.URLParam(r, "id"))
		if !ok {
			http.Error(w, "invalid media id", http.StatusBadRequest)
			return
		}

		item, err := s.LibraryRepo.GetByID(id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		thumbPath, err := s.Previewer.EnsureThumbnail(item)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Cache-Control", "public, max-age=86400")
		http.ServeFile(w, r, thumbPath)
	})

	r.Post("/api/library/{id}/open-vlc", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDParam(chi.URLParam(r, "id"))
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "invalid media id",
			})
			return
		}

		item, err := s.LibraryRepo.GetByID(id)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]any{
				"error": err.Error(),
			})
			return
		}

		if err := s.Actions.OpenInVLC(item); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"ok": true,
		})
	})

	r.Post("/api/library/{id}/reveal-file", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDParam(chi.URLParam(r, "id"))
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "invalid media id",
			})
			return
		}

		item, err := s.LibraryRepo.GetByID(id)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]any{
				"error": err.Error(),
			})
			return
		}

		if err := s.Actions.RevealInFolder(item); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"ok": true,
		})
	})

	r.Get("/api/library/{id}/hover-preview", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDParam(chi.URLParam(r, "id"))
		if !ok {
			http.Error(w, "invalid media id", http.StatusBadRequest)
			return
		}

		item, err := s.LibraryRepo.GetByID(id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		clipPath, err := s.Previewer.EnsureHoverClip(item)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Cache-Control", "public, max-age=86400")
		http.ServeFile(w, r, clipPath)
	})

	r.Get("/api/library/{id}/stream", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDParam(chi.URLParam(r, "id"))
		if !ok {
			http.Error(w, "invalid media id", http.StatusBadRequest)
			return
		}

		item, err := s.LibraryRepo.GetByID(id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		path := s.Previewer.ResolveMediaPath(item)
		if strings.TrimSpace(path) == "" {
			http.Error(w, "media path is empty", http.StatusBadRequest)
			return
		}

		file, err := os.Open(path)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		defer file.Close()

		info, err := file.Stat()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if contentType := mime.TypeByExtension(filepath.Ext(path)); contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}

		http.ServeContent(w, r, filepath.Base(path), info.ModTime(), file)
	})

	r.Get("/api/metadata/options", func(w http.ResponseWriter, r *http.Request) {
		options, err := s.MetadataRepo.GetOptions()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{
				"error": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusOK, options)
	})

	r.Post("/api/metadata/companies", func(w http.ResponseWriter, r *http.Request) {
		var payload metadata.CreateCompanyInput
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json body"})
			return
		}

		item, err := s.MetadataRepo.CreateCompany(payload)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, item)
	})

	r.Post("/api/metadata/people", func(w http.ResponseWriter, r *http.Request) {
		var payload metadata.CreatePersonInput
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json body"})
			return
		}

		item, err := s.MetadataRepo.CreatePerson(payload)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, item)
	})

	r.Post("/api/metadata/categories", func(w http.ResponseWriter, r *http.Request) {
		var payload metadata.CreateCategoryInput
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json body"})
			return
		}

		item, err := s.MetadataRepo.CreateCategory(payload)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, item)
	})

	r.Post("/api/metadata/tags", func(w http.ResponseWriter, r *http.Request) {
		var payload metadata.CreateTagInput
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json body"})
			return
		}

		item, err := s.MetadataRepo.CreateTag(payload)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, item)
	})

	r.Post("/api/metadata/series", func(w http.ResponseWriter, r *http.Request) {
		var payload metadata.CreateSeriesInput
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json body"})
			return
		}

		item, err := s.MetadataRepo.CreateSeries(payload)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, item)
	})

	r.Get("/api/search/tagged", func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		sortDir := strings.TrimSpace(r.URL.Query().Get("sort_dir"))

		page := 1
		if value := r.URL.Query().Get("page"); value != "" {
			if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 {
				page = parsed
			}
		}

		pageSize := 20
		if value := r.URL.Query().Get("page_size"); value != "" {
			if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 {
				pageSize = parsed
			}
		}

		params := library.SearchTaggedParams{
			Query:           q,
			Page:            page,
			PageSize:        pageSize,
			SortDir:         sortDir,
			MediaTypes:      parseCSVStrings(r.URL.Query().Get("media_types")),
			CompanyIDs:      parseCSVInt64(r.URL.Query().Get("company_ids")),
			PersonIDs:       parseCSVInt64(r.URL.Query().Get("person_ids")),
			SeriesIDs:       parseCSVInt64(r.URL.Query().Get("series_ids")),
			MainCategoryIDs: parseCSVInt64(r.URL.Query().Get("main_category_ids")),
			SubCategoryIDs:  parseCSVInt64(r.URL.Query().Get("sub_category_ids")),
			TagIDs:          parseCSVInt64(r.URL.Query().Get("tag_ids")),
		}

		items, total, err := s.LibraryRepo.SearchTagged(params)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{
				"error": err.Error(),
			})
			return
		}

		totalPages := 0
		if total > 0 {
			totalPages = (total + pageSize - 1) / pageSize
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"items":       items,
			"total":       total,
			"page":        page,
			"page_size":   pageSize,
			"total_pages": totalPages,
			"sort_dir":    strings.ToLower(sortDir),
		})
	})

	return r
}

func parseIDParam(value string) (int64, bool) {
	id, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil || id <= 0 {
		return 0, false
	}
	return id, true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func parseCSVInt64(value string) []int64 {
	value = strings.TrimSpace(value)
	if value == "" {
		return []int64{}
	}

	parts := strings.Split(value, ",")
	out := make([]int64, 0, len(parts))

	for _, part := range parts {
		n, err := strconv.ParseInt(strings.TrimSpace(part), 10, 64)
		if err != nil || n <= 0 {
			continue
		}
		out = append(out, n)
	}

	return out
}

func parseCSVStrings(value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return []string{}
	}

	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))

	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		out = append(out, part)
	}

	return out
}
