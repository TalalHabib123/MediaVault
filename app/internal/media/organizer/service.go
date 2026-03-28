package organizer

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"mediavault/internal/config"
	"mediavault/internal/library"
)

type Service struct {
	ConfigService *config.Service
	LibraryRepo   *library.Repository

	mu         sync.RWMutex
	currentJob *MoveJobStatus
}

type MoveResult struct {
	OldPath        string `json:"old_path"`
	NewPath        string `json:"new_path"`
	LibraryRoot    string `json:"library_root"`
	AlreadyManaged bool   `json:"already_managed"`
}

type Error struct {
	Status int
	Err    error
}

func (e *Error) Error() string {
	if e == nil || e.Err == nil {
		return "move failed"
	}
	return e.Err.Error()
}

func (e *Error) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

type MoveJobItemStatus struct {
	MediaID         int64  `json:"media_id"`
	Title           string `json:"title"`
	Status          string `json:"status"`
	Stage           string `json:"stage"`
	ProgressPercent int    `json:"progress_percent"`
	AlreadyManaged  bool   `json:"already_managed"`
	OldPath         string `json:"old_path"`
	NewPath         string `json:"new_path"`
	Error           string `json:"error"`
}

type MoveJobStatus struct {
	ID                  string              `json:"id"`
	Status              string              `json:"status"`
	TotalItems          int                 `json:"total_items"`
	CompletedItems      int                 `json:"completed_items"`
	SucceededItems      int                 `json:"succeeded_items"`
	AlreadyManagedItems int                 `json:"already_managed_items"`
	FailedItems         int                 `json:"failed_items"`
	ProgressPercent     int                 `json:"progress_percent"`
	CurrentItemID       int64               `json:"current_item_id"`
	CurrentTitle        string              `json:"current_title"`
	CurrentStage        string              `json:"current_stage"`
	Items               []MoveJobItemStatus `json:"items"`
	StartedAt           string              `json:"started_at"`
	FinishedAt          string              `json:"finished_at"`
}

func NewService(cfg *config.Service, repo *library.Repository) *Service {
	return &Service{
		ConfigService: cfg,
		LibraryRepo:   repo,
	}
}

func (s *Service) StartMoveJob(ids []int64) (*MoveJobStatus, error) {
	deduped := dedupeMoveIDs(ids)
	if len(deduped) == 0 {
		return nil, &Error{
			Status: http.StatusBadRequest,
			Err:    fmt.Errorf("no media ids provided"),
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.currentJob != nil && s.currentJob.Status == "running" {
		return nil, &Error{
			Status: http.StatusConflict,
			Err:    fmt.Errorf("a move job is already running"),
		}
	}

	job := &MoveJobStatus{
		ID:         fmt.Sprintf("move-%d", time.Now().UTC().UnixNano()),
		Status:     "running",
		TotalItems: len(deduped),
		Items:      make([]MoveJobItemStatus, 0, len(deduped)),
		StartedAt:  time.Now().UTC().Format(time.RFC3339),
	}

	for _, id := range deduped {
		job.Items = append(job.Items, MoveJobItemStatus{
			MediaID:         id,
			Status:          "pending",
			Stage:           "queued",
			ProgressPercent: 0,
		})
	}

	s.currentJob = job

	go s.runMoveJob(job.ID, deduped)

	return cloneMoveJobStatus(job), nil
}

func (s *Service) GetCurrentJobStatus() *MoveJobStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return cloneMoveJobStatus(s.currentJob)
}

func (s *Service) MoveToLibrary(id int64) (*MoveResult, error) {
	return s.moveToLibraryWithProgress(id, nil)
}

func (s *Service) moveToLibraryWithProgress(id int64, report func(item *library.MediaItem, stage string, progress int)) (*MoveResult, error) {
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

	emitProgress(report, item, "validating", 10)

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

	emitProgress(report, item, "preparing", 35)

	targetPath := buildTargetPath(libraryRoot, item)
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		return nil, err
	}

	targetPath = resolveNonConflictingPath(targetPath)

	if filepath.Clean(currentPath) == filepath.Clean(targetPath) {
		emitProgress(report, item, "completed", 100)
		return &MoveResult{
			OldPath:        currentPath,
			NewPath:        targetPath,
			LibraryRoot:    libraryRoot,
			AlreadyManaged: true,
		}, nil
	}

	emitProgress(report, item, "transferring", 70)

	if err := moveFile(currentPath, targetPath); err != nil {
		return nil, err
	}

	emitProgress(report, item, "finalizing", 90)

	if err := s.LibraryRepo.UpdateManagedPath(id, targetPath, filepath.Base(targetPath)); err != nil {
		return nil, err
	}

	emitProgress(report, item, "completed", 100)

	return &MoveResult{
		OldPath:        currentPath,
		NewPath:        targetPath,
		LibraryRoot:    libraryRoot,
		AlreadyManaged: false,
	}, nil
}

func emitProgress(report func(item *library.MediaItem, stage string, progress int), item *library.MediaItem, stage string, progress int) {
	if report == nil || item == nil {
		return
	}
	report(item, stage, progress)
}

func (s *Service) runMoveJob(jobID string, ids []int64) {
	for _, id := range ids {
		item, err := s.LibraryRepo.GetByID(id)
		title := ""
		if err == nil && item != nil {
			title = item.Title
		}
		s.updateJobItem(jobID, id, title, "running", "queued", 0, false, "", "", "")

		result, moveErr := s.moveToLibraryWithProgress(id, func(item *library.MediaItem, stage string, progress int) {
			stageTitle := title
			if item != nil && strings.TrimSpace(item.Title) != "" {
				stageTitle = item.Title
			}
			s.updateJobItem(jobID, id, stageTitle, "running", stage, progress, false, "", "", "")
		})

		if moveErr != nil {
			s.failJobItem(jobID, id, moveErr)
			continue
		}

		if result.AlreadyManaged {
			s.completeJobItem(jobID, id, title, "already_managed", "completed", 100, true, result.OldPath, result.NewPath, "")
		} else {
			s.completeJobItem(jobID, id, title, "moved", "completed", 100, false, result.OldPath, result.NewPath, "")
		}
	}

	s.finishJob(jobID)
}

func (s *Service) updateJobItem(jobID string, mediaID int64, title string, status string, stage string, progress int, alreadyManaged bool, oldPath string, newPath string, errText string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.currentJob == nil || s.currentJob.ID != jobID {
		return
	}

	for i := range s.currentJob.Items {
		if s.currentJob.Items[i].MediaID != mediaID {
			continue
		}
		if title != "" {
			s.currentJob.Items[i].Title = title
		}
		s.currentJob.Items[i].Status = status
		s.currentJob.Items[i].Stage = stage
		s.currentJob.Items[i].ProgressPercent = clampPercent(progress)
		s.currentJob.Items[i].AlreadyManaged = alreadyManaged
		if oldPath != "" {
			s.currentJob.Items[i].OldPath = oldPath
		}
		if newPath != "" {
			s.currentJob.Items[i].NewPath = newPath
		}
		if errText != "" {
			s.currentJob.Items[i].Error = errText
		}
		if s.currentJob.Items[i].Title == "" {
			s.currentJob.Items[i].Title = fmt.Sprintf("#%d", mediaID)
		}
		s.currentJob.CurrentItemID = mediaID
		s.currentJob.CurrentTitle = s.currentJob.Items[i].Title
		s.currentJob.CurrentStage = stage
		break
	}
}

func (s *Service) failJobItem(jobID string, mediaID int64, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.currentJob == nil || s.currentJob.ID != jobID {
		return
	}

	for i := range s.currentJob.Items {
		if s.currentJob.Items[i].MediaID != mediaID {
			continue
		}
		if s.currentJob.Items[i].Title == "" {
			s.currentJob.Items[i].Title = fmt.Sprintf("#%d", mediaID)
		}
		s.currentJob.Items[i].Status = "failed"
		s.currentJob.Items[i].Stage = "failed"
		s.currentJob.Items[i].ProgressPercent = 100
		s.currentJob.Items[i].Error = err.Error()
		s.currentJob.CurrentItemID = mediaID
		s.currentJob.CurrentTitle = s.currentJob.Items[i].Title
		s.currentJob.CurrentStage = "failed"
		s.currentJob.CompletedItems++
		s.currentJob.FailedItems++
		s.currentJob.ProgressPercent = computeMoveProgress(s.currentJob.CompletedItems, s.currentJob.TotalItems)
		break
	}
}

func (s *Service) completeJobItem(jobID string, mediaID int64, title string, status string, stage string, progress int, alreadyManaged bool, oldPath string, newPath string, errText string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.currentJob == nil || s.currentJob.ID != jobID {
		return
	}

	for i := range s.currentJob.Items {
		if s.currentJob.Items[i].MediaID != mediaID {
			continue
		}
		if title != "" {
			s.currentJob.Items[i].Title = title
		}
		if s.currentJob.Items[i].Title == "" {
			s.currentJob.Items[i].Title = fmt.Sprintf("#%d", mediaID)
		}
		s.currentJob.Items[i].Status = status
		s.currentJob.Items[i].Stage = stage
		s.currentJob.Items[i].ProgressPercent = clampPercent(progress)
		s.currentJob.Items[i].AlreadyManaged = alreadyManaged
		s.currentJob.Items[i].OldPath = oldPath
		s.currentJob.Items[i].NewPath = newPath
		s.currentJob.Items[i].Error = errText
		s.currentJob.CurrentItemID = mediaID
		s.currentJob.CurrentTitle = s.currentJob.Items[i].Title
		s.currentJob.CurrentStage = stage
		s.currentJob.CompletedItems++
		if alreadyManaged {
			s.currentJob.AlreadyManagedItems++
		} else {
			s.currentJob.SucceededItems++
		}
		s.currentJob.ProgressPercent = computeMoveProgress(s.currentJob.CompletedItems, s.currentJob.TotalItems)
		break
	}
}

func (s *Service) finishJob(jobID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.currentJob == nil || s.currentJob.ID != jobID {
		return
	}

	s.currentJob.Status = "completed"
	s.currentJob.ProgressPercent = 100
	s.currentJob.CurrentStage = ""
	s.currentJob.FinishedAt = time.Now().UTC().Format(time.RFC3339)
}

func cloneMoveJobStatus(job *MoveJobStatus) *MoveJobStatus {
	if job == nil {
		return nil
	}

	clone := *job
	clone.Items = append([]MoveJobItemStatus{}, job.Items...)
	return &clone
}

func computeMoveProgress(completed int, total int) int {
	if total <= 0 {
		return 0
	}
	if completed >= total {
		return 100
	}
	return int(float64(completed) / float64(total) * 100)
}

func clampPercent(value int) int {
	if value < 0 {
		return 0
	}
	if value > 100 {
		return 100
	}
	return value
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

func IsConflictError(err error) bool {
	var moveErr *Error
	return errors.As(err, &moveErr) && moveErr.Status == http.StatusConflict
}
