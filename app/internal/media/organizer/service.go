package organizer

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"mediavault/internal/config"
	"mediavault/internal/library"
)

type Service struct {
	ConfigService *config.Service
	LibraryRepo   *library.Repository
}

type MoveResult struct {
	OldPath        string `json:"old_path"`
	NewPath        string `json:"new_path"`
	LibraryRoot    string `json:"library_root"`
	AlreadyManaged bool   `json:"already_managed"`
}

func NewService(cfg *config.Service, repo *library.Repository) *Service {
	return &Service{
		ConfigService: cfg,
		LibraryRepo:   repo,
	}
}

func (s *Service) MoveToLibrary(id int64) (*MoveResult, error) {
	cfg, err := s.ConfigService.Load()
	if err != nil {
		return nil, err
	}

	libraryRoot := s.ConfigService.ResolvePath(cfg.Paths.LibraryRoot)
	if strings.TrimSpace(libraryRoot) == "" {
		return nil, fmt.Errorf("library root is not configured")
	}

	item, err := s.LibraryRepo.GetByID(id)
	if err != nil {
		return nil, err
	}

	currentPath := item.SourcePath
	if strings.TrimSpace(item.CanonicalPath) != "" {
		currentPath = item.CanonicalPath
	}
	if strings.TrimSpace(currentPath) == "" {
		return nil, fmt.Errorf("media item has no current path")
	}

	if _, err := os.Stat(currentPath); err != nil {
		return nil, fmt.Errorf("current file not found: %s", currentPath)
	}

	targetPath := buildTargetPath(libraryRoot, item)
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		return nil, err
	}

	targetPath = resolveNonConflictingPath(targetPath)

	if filepath.Clean(currentPath) == filepath.Clean(targetPath) {
		return &MoveResult{
			OldPath:        currentPath,
			NewPath:        targetPath,
			LibraryRoot:    libraryRoot,
			AlreadyManaged: true,
		}, nil
	}

	if err := moveFile(currentPath, targetPath); err != nil {
		return nil, err
	}

	if err := s.LibraryRepo.UpdateManagedPath(id, targetPath, filepath.Base(targetPath)); err != nil {
		return nil, err
	}

	return &MoveResult{
		OldPath:        currentPath,
		NewPath:        targetPath,
		LibraryRoot:    libraryRoot,
		AlreadyManaged: false,
	}, nil
}

func buildTargetPath(libraryRoot string, item *library.MediaItem) string {
	companyFolder := sanitizeSegment(item.CompanyName)
	if companyFolder == "" {
		companyFolder = "_No Company"
	}

	fileName := item.FileName
	if strings.TrimSpace(fileName) == "" {
		fileName = filepath.Base(item.SourcePath)
	}

	switch item.MediaType {
	case "series_episode":
		seriesFolder := sanitizeSegment(item.SeriesName)
		if seriesFolder == "" {
			seriesFolder = "_No Series"
		}

		seasonFolder := fmt.Sprintf("Season %02d", max(item.SeasonNumber, 0))
		return filepath.Join(libraryRoot, "series", companyFolder, seriesFolder, seasonFolder, fileName)

	case "movie":
		return filepath.Join(libraryRoot, "movies", companyFolder, fileName)

	default:
		return filepath.Join(libraryRoot, "videos", companyFolder, fileName)
	}
}

func resolveNonConflictingPath(path string) string {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return path
	}

	dir := filepath.Dir(path)
	ext := filepath.Ext(path)
	base := strings.TrimSuffix(filepath.Base(path), ext)

	for i := 1; i < 10000; i++ {
		candidate := filepath.Join(dir, fmt.Sprintf("%s (%d)%s", base, i, ext))
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate
		}
	}

	return path
}

func moveFile(src string, dst string) error {
	if err := os.Rename(src, dst); err == nil {
		return nil
	}

	if err := copyFile(src, dst); err != nil {
		return err
	}

	return os.Remove(src)
}

func copyFile(src string, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer func() {
		_ = out.Close()
	}()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}

	return out.Sync()
}

func sanitizeSegment(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}

	invalid := `<>:"/\|?*`
	value = strings.Map(func(r rune) rune {
		if strings.ContainsRune(invalid, r) || r < 32 {
			return -1
		}
		return r
	}, value)

	value = strings.Join(strings.Fields(value), " ")
	value = strings.TrimSpace(value)
	value = strings.Trim(value, ".")

	return value
}

type BulkMoveFailure struct {
	MediaID int64  `json:"media_id"`
	Error   string `json:"error"`
}

type BulkMoveSummary struct {
	Requested      int               `json:"requested"`
	Moved          int               `json:"moved"`
	AlreadyManaged int               `json:"already_managed"`
	Failed         []BulkMoveFailure `json:"failed"`
}

func (s *Service) MoveManyToLibrary(ids []int64) (*BulkMoveSummary, error) {
	deduped := dedupeMoveIDs(ids)
	if len(deduped) == 0 {
		return nil, fmt.Errorf("no media ids provided")
	}

	summary := &BulkMoveSummary{
		Requested: len(deduped),
		Failed:    []BulkMoveFailure{},
	}

	for _, id := range deduped {
		result, err := s.MoveToLibrary(id)
		if err != nil {
			summary.Failed = append(summary.Failed, BulkMoveFailure{
				MediaID: id,
				Error:   err.Error(),
			})
			continue
		}

		if result.AlreadyManaged {
			summary.AlreadyManaged++
		} else {
			summary.Moved++
		}
	}

	return summary, nil
}

func dedupeMoveIDs(values []int64) []int64 {
	seen := map[int64]bool{}
	out := make([]int64, 0, len(values))

	for _, value := range values {
		if value <= 0 {
			continue
		}
		if seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}

	return out
}

func max(a int, b int) int {
	if a > b {
		return a
	}
	return b
}
