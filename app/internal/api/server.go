package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"mediavault/internal/auth"
	"mediavault/internal/config"
	"mediavault/internal/library"
	"mediavault/internal/media/deletion"
	"mediavault/internal/media/organizer"
	"mediavault/internal/media/playback"
	"mediavault/internal/media/previews"
	"mediavault/internal/media/scanner"
	"mediavault/internal/metadata"
	"mediavault/internal/system/actions"
)

type Server struct {
	ConfigService *config.Service
	AuthService   *auth.Service
	AccessMode    string
	BindHost      string
	LibraryRepo   *library.Repository
	MetadataRepo  *metadata.Repository
	Scanner       *scanner.Service
	Reconciler    *library.ReconcileService
	Organizer     *organizer.Service
	Playback      *playback.Service
	Previewer     *previews.Service
	Deletion      *deletion.Service
	Actions       *actions.Service
}

func NewRouter(s *Server) http.Handler {
	if s.AccessMode == "" {
		s.AccessMode = "local"
	}
	if s.BindHost == "" {
		s.BindHost = "localhost"
	}
	if s.Playback == nil {
		s.Playback = playback.NewService(s.ConfigService)
	}
	if s.Reconciler == nil && s.LibraryRepo != nil {
		s.Reconciler = library.NewReconcileService(s.LibraryRepo)
	}

	r := chi.NewRouter()
	r.Use(auth.Gate{Service: s.AuthService, ConfigService: s.ConfigService}.Middleware)

	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok": true,
		})
	})

	r.Get("/api/auth/status", func(w http.ResponseWriter, r *http.Request) {
		hasUser, err := s.AuthService.Repository().HasAnyUser()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to read auth status"})
			return
		}

		var user any
		authenticated := false
		if hasUser {
			principal, _, err := s.AuthService.ValidateRequest(r)
			if err == nil {
				authenticated = true
				user = map[string]any{
					"id":       principal.UserID,
					"username": principal.Username,
					"role":     principal.Role,
				}
			}
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"setup_required": !hasUser,
			"authenticated":  authenticated,
			"user":           user,
			"lan_enabled":    s.AccessMode == "lan",
		})
	})

	r.Post("/api/auth/setup", func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Username       string `json:"username"`
			Password       string `json:"password"`
			RememberDevice bool   `json:"remember_device"`
			DeviceLabel    string `json:"device_label"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json body"})
			return
		}

		result, err := s.AuthService.Setup(auth.SetupInput{
			Username:       payload.Username,
			Password:       payload.Password,
			RememberDevice: payload.RememberDevice,
			DeviceLabel:    payload.DeviceLabel,
		}, r)
		if err != nil {
			status := http.StatusBadRequest
			if errors.Is(err, auth.ErrSetupAlreadyComplete) {
				status = http.StatusConflict
			}
			writeJSON(w, status, map[string]any{"error": err.Error()})
			return
		}

		auth.SetSessionCookie(w, r, result)
		writeJSON(w, http.StatusOK, map[string]any{
			"ok": true,
			"user": map[string]any{
				"id":       result.User.ID,
				"username": result.User.Username,
				"role":     result.User.Role,
			},
		})
	})

	r.Post("/api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Username       string `json:"username"`
			Password       string `json:"password"`
			RememberDevice bool   `json:"remember_device"`
			DeviceLabel    string `json:"device_label"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json body"})
			return
		}

		result, err := s.AuthService.Login(auth.LoginInput{
			Username:       payload.Username,
			Password:       payload.Password,
			RememberDevice: payload.RememberDevice,
			DeviceLabel:    payload.DeviceLabel,
		}, r)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": err.Error()})
			return
		}

		auth.SetSessionCookie(w, r, result)
		writeJSON(w, http.StatusOK, map[string]any{
			"ok": true,
			"user": map[string]any{
				"id":       result.User.ID,
				"username": result.User.Username,
				"role":     result.User.Role,
			},
		})
	})

	r.Post("/api/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		s.AuthService.Logout(r)
		auth.ClearSessionCookie(w, r)
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})

	r.Get("/api/auth/me", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := auth.PrincipalFromContext(r.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "authentication required"})
			return
		}
		session, _ := auth.SessionFromContext(r.Context())
		writeJSON(w, http.StatusOK, map[string]any{
			"user": map[string]any{
				"id":       principal.UserID,
				"username": principal.Username,
				"role":     principal.Role,
			},
			"session": map[string]any{
				"id":              session.ID,
				"device_label":    session.DeviceLabel,
				"remember_device": session.RememberDevice,
				"created_at":      session.CreatedAt,
				"last_seen_at":    session.LastSeenAt,
				"expires_at":      session.ExpiresAt,
			},
		})
	})

	r.Get("/api/auth/csrf", func(w http.ResponseWriter, r *http.Request) {
		session, ok := auth.SessionFromContext(r.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "authentication required"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"csrf_token": s.AuthService.CSRFToken(session),
		})
	})

	r.Get("/api/auth/sessions", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := auth.PrincipalFromContext(r.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "authentication required"})
			return
		}
		current, _ := auth.SessionFromContext(r.Context())
		sessions, err := s.AuthService.Repository().ListSessions(principal.UserID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to list sessions"})
			return
		}
		out := make([]auth.SessionSummary, 0, len(sessions))
		for _, session := range sessions {
			out = append(out, auth.SessionSummary{
				ID:             session.ID,
				DeviceLabel:    session.DeviceLabel,
				UserAgent:      session.UserAgent,
				RemoteAddr:     session.RemoteAddr,
				RememberDevice: session.RememberDevice,
				CreatedAt:      session.CreatedAt,
				LastSeenAt:     session.LastSeenAt,
				ExpiresAt:      session.ExpiresAt,
				Current:        session.ID == current.ID,
			})
		}
		writeJSON(w, http.StatusOK, map[string]any{"sessions": out})
	})

	r.Delete("/api/auth/sessions/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDParam(chi.URLParam(r, "id"))
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid session id"})
			return
		}
		if err := s.AuthService.Repository().RevokeSession(id); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to revoke session"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})

	r.Post("/api/auth/change-password", func(w http.ResponseWriter, r *http.Request) {
		principal, ok := auth.PrincipalFromContext(r.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "authentication required"})
			return
		}
		session, _ := auth.SessionFromContext(r.Context())
		var payload struct {
			CurrentPassword     string `json:"current_password"`
			NewPassword         string `json:"new_password"`
			RevokeOtherSessions bool   `json:"revoke_other_sessions"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json body"})
			return
		}
		if err := s.AuthService.ChangePassword(principal.UserID, payload.CurrentPassword, payload.NewPassword, session.ID, payload.RevokeOtherSessions); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})

	r.Get("/api/system/capabilities", func(w http.ResponseWriter, r *http.Request) {
		principal, _ := auth.PrincipalFromContext(r.Context())
		cfg, err := s.ConfigService.Load()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to load settings"})
			return
		}
		isLoopback := auth.IsLoopbackRequest(r)
		isOwner := principal.Role == "owner"
		vlcPath := strings.TrimSpace(cfg.Tools.VLC)
		vlcOK := false
		if vlcPath != "" {
			if _, err := os.Stat(s.ConfigService.ResolvePath(vlcPath)); err == nil {
				vlcOK = true
			}
		}
		warnings := []string{}
		if s.AccessMode == "lan" {
			warnings = append(warnings, "LAN mode is for trusted networks only and is not designed for direct internet exposure.")
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"access_mode": s.AccessMode,
			"request_context": map[string]any{
				"is_loopback":     isLoopback,
				"is_host_capable": isLoopback,
			},
			"capabilities": map[string]any{
				"browser_playback":    true,
				"open_vlc_on_host":    isOwner && isLoopback && vlcOK,
				"reveal_file_on_host": isOwner && isLoopback,
				"settings_admin":      isOwner,
				"file_mutations":      isOwner,
			},
			"warnings": warnings,
		})
	})

	r.Get("/api/settings/security", func(w http.ResponseWriter, r *http.Request) {
		cfg, err := s.ConfigService.Load()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to load settings"})
			return
		}
		cfg.Security.LANEnabled = s.AccessMode == "lan"
		cfg.Security.BindHost = s.BindHost
		writeJSON(w, http.StatusOK, cfg.Security)
	})

	r.Put("/api/settings/security", func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			AuthEnabled          bool     `json:"auth_enabled"`
			LANEnabled           bool     `json:"lan_enabled"`
			BindHost             string   `json:"bind_host"`
			AllowedOrigins       []string `json:"allowed_origins"`
			SessionIdleMinutes   int      `json:"session_idle_minutes"`
			RememberedDeviceDays int      `json:"remembered_device_days"`
			FailedLoginLimit     int      `json:"failed_login_limit"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json body"})
			return
		}
		hasUser, err := s.AuthService.Repository().HasAnyUser()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to read auth status"})
			return
		}
		if payload.LANEnabled && !hasUser {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "LAN mode cannot be enabled before owner setup"})
			return
		}
		cfg, err := s.ConfigService.Load()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to load settings"})
			return
		}
		cfg.Security.AuthEnabled = true
		cfg.Security.LANEnabled = payload.LANEnabled
		cfg.Security.BindHost = strings.TrimSpace(payload.BindHost)
		if cfg.Security.BindHost == "" {
			if payload.LANEnabled {
				cfg.Security.BindHost = "0.0.0.0"
			} else {
				cfg.Security.BindHost = "localhost"
			}
		}
		cfg.Security.AllowedOrigins = payload.AllowedOrigins
		cfg.Security.SessionIdleMinutes = payload.SessionIdleMinutes
		cfg.Security.RememberedDeviceDays = payload.RememberedDeviceDays
		cfg.Security.FailedLoginLimit = payload.FailedLoginLimit
		if err := s.ConfigService.Save(cfg); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to save security settings"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":               true,
			"security":         cfg.Security,
			"restart_required": s.BindHost != cfg.Security.BindHost,
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
		cfg.Server.Host = s.BindHost
		cfg.Security.LANEnabled = s.AccessMode == "lan"
		cfg.Security.BindHost = s.BindHost
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
			payload.Server.Host = "localhost"
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

		reconcileSummary, err := s.Reconciler.Reconcile(context.Background())
		if err != nil {
			summary.Errors = append(summary.Errors, fmt.Sprintf("library reconciliation failed: %v", err))
		}

		previewJob := s.Previewer.StartWarmup(summary.ProcessedMediaIDs)

		writeJSON(w, http.StatusOK, map[string]any{
			"sources":     summary.Sources,
			"files_seen":  summary.FilesSeen,
			"inserted":    summary.Inserted,
			"updated":     summary.Updated,
			"skipped":     summary.Skipped,
			"errors":      summary.Errors,
			"reconcile":   reconcileSummary,
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

	r.Post("/api/library/reconcile", func(w http.ResponseWriter, r *http.Request) {
		summary, err := s.Reconciler.Reconcile(context.Background())
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{
				"error": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusOK, summary)
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
		if !auth.IsLoopbackRequest(r) {
			writeJSON(w, http.StatusForbidden, map[string]any{
				"error": "VLC launch is only available from the host PC.",
			})
			return
		}

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
		if !auth.IsLoopbackRequest(r) {
			writeJSON(w, http.StatusForbidden, map[string]any{
				"error": "Reveal in folder is only available from the host PC.",
			})
			return
		}

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

		if err := s.Playback.Serve(w, r, item, path); err != nil {
			status := http.StatusInternalServerError
			if os.IsNotExist(err) {
				status = http.StatusNotFound
			}
			http.Error(w, err.Error(), status)
		}
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
