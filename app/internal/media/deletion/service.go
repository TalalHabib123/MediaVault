package deletion

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"mediavault/internal/config"
	"mediavault/internal/library"
	"mediavault/internal/media/previews"
)

const (
	ModeDeleteFile = "delete_file"
	ModeDBOnly     = "db_only"
)

type Service struct {
	ConfigService *config.Service
	LibraryRepo   *library.Repository
	Previewer     *previews.Service
}

type Result struct {
	MediaID             int64  `json:"media_id"`
	Mode                string `json:"mode"`
	FileDeleted         bool   `json:"file_deleted"`
	PreviewCacheCleaned bool   `json:"preview_cache_cleaned"`
}

type Error struct {
	Status int
	Err    error
}

func (e *Error) Error() string {
	if e == nil || e.Err == nil {
		return "delete failed"
	}
	return e.Err.Error()
}

func (e *Error) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

func NewService(cfg *config.Service, repo *library.Repository, previewer *previews.Service) *Service {
	return &Service{
		ConfigService: cfg,
		LibraryRepo:   repo,
		Previewer:     previewer,
	}
}

func (s *Service) Delete(id int64, mode string) (*Result, error) {
	mode = strings.TrimSpace(mode)
	if mode != ModeDeleteFile && mode != ModeDBOnly {
		return nil, &Error{
			Status: http.StatusBadRequest,
			Err:    fmt.Errorf("invalid delete mode"),
		}
	}

	item, err := s.LibraryRepo.GetByID(id)
	if err != nil {
		return nil, &Error{
			Status: http.StatusNotFound,
			Err:    err,
		}
	}

	result := &Result{
		MediaID: id,
		Mode:    mode,
	}

	if mode == ModeDeleteFile {
		path := s.Previewer.ResolveMediaPath(item)
		if strings.TrimSpace(path) == "" {
			return nil, &Error{
				Status: http.StatusBadRequest,
				Err:    fmt.Errorf("media path is empty"),
			}
		}

		if _, err := os.Stat(path); err != nil {
			if os.IsNotExist(err) {
				return nil, &Error{
					Status: http.StatusConflict,
					Err:    fmt.Errorf("current file not found: %s", path),
				}
			}
			return nil, &Error{
				Status: http.StatusConflict,
				Err:    fmt.Errorf("failed to access current file: %w", err),
			}
		}

		if err := os.Remove(path); err != nil {
			return nil, &Error{
				Status: http.StatusConflict,
				Err:    fmt.Errorf("failed to delete current file: %w", err),
			}
		}

		result.FileDeleted = true
	}

	if err := s.LibraryRepo.DeleteByID(id); err != nil {
		status := http.StatusBadRequest
		if strings.Contains(strings.ToLower(err.Error()), "not found") {
			status = http.StatusNotFound
		}
		return nil, &Error{
			Status: status,
			Err:    err,
		}
	}

	result.PreviewCacheCleaned = s.cleanupPreviewCache(item.ID)
	return result, nil
}

func (s *Service) cleanupPreviewCache(mediaID int64) bool {
	if s.ConfigService == nil {
		return false
	}

	cfg, err := s.ConfigService.Load()
	if err != nil {
		return false
	}

	cacheRoot := s.ConfigService.ResolvePath(cfg.Paths.PreviewCache)
	if strings.TrimSpace(cacheRoot) == "" {
		return false
	}

	paths := []string{
		filepath.Join(cacheRoot, "thumbs", fmt.Sprintf("%d.jpg", mediaID)),
		filepath.Join(cacheRoot, "hover", fmt.Sprintf("%d.mp4", mediaID)),
	}

	for _, path := range paths {
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return false
		}
	}

	return true
}
