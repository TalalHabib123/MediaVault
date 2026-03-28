package previews

import (
	"context"
	"fmt"
	"os"
	"os/exec"
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

	mu            sync.RWMutex
	currentJob    *WarmupJobStatus
	currentCancel context.CancelFunc
}

type WarmupJobStatus struct {
	ID              string   `json:"id"`
	Status          string   `json:"status"`
	TotalItems      int      `json:"total_items"`
	TotalSteps      int      `json:"total_steps"`
	CompletedSteps  int      `json:"completed_steps"`
	SucceededSteps  int      `json:"succeeded_steps"`
	FailedSteps     int      `json:"failed_steps"`
	ProgressPercent int      `json:"progress_percent"`
	CurrentItemID   int64    `json:"current_item_id"`
	CurrentTitle    string   `json:"current_title"`
	CurrentStage    string   `json:"current_stage"`
	Errors          []string `json:"errors"`
	StartedAt       string   `json:"started_at"`
	FinishedAt      string   `json:"finished_at"`
}

func NewService(cfg *config.Service, repo *library.Repository) *Service {
	return &Service{
		ConfigService: cfg,
		LibraryRepo:   repo,
	}
}

func (s *Service) ResolveMediaPath(item *library.MediaItem) string {
	if strings.TrimSpace(item.CanonicalPath) != "" {
		return item.CanonicalPath
	}
	return item.SourcePath
}

func (s *Service) StartWarmup(mediaIDs []int64) *WarmupJobStatus {
	ids := dedupePreviewIDs(mediaIDs)
	if len(ids) == 0 {
		return nil
	}

	s.mu.Lock()
	if s.currentCancel != nil {
		s.currentCancel()
	}

	ctx, cancel := context.WithCancel(context.Background())
	job := &WarmupJobStatus{
		ID:         fmt.Sprintf("preview-%d", time.Now().UTC().UnixNano()),
		Status:     "running",
		TotalItems: len(ids),
		TotalSteps: len(ids) * 2,
		Errors:     []string{},
		StartedAt:  time.Now().UTC().Format(time.RFC3339),
	}
	s.currentJob = job
	s.currentCancel = cancel
	s.mu.Unlock()

	go s.runWarmup(ctx, job.ID, ids)

	return cloneJobStatus(job)
}

func (s *Service) GetWarmupStatus() *WarmupJobStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return cloneJobStatus(s.currentJob)
}

func (s *Service) runWarmup(ctx context.Context, jobID string, ids []int64) {
	workerCount := previewWorkerCount(len(ids))
	mediaCh := make(chan int64)
	var wg sync.WaitGroup

	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()

			for mediaID := range mediaCh {
				select {
				case <-ctx.Done():
					return
				default:
				}

				item, err := s.LibraryRepo.GetByID(mediaID)
				if err != nil {
					s.recordWarmupFailure(jobID, mediaID, "", "thumbnail", err)
					s.recordWarmupFailure(jobID, mediaID, "", "hover", err)
					continue
				}

				s.updateCurrentItem(jobID, item.ID, item.Title, "thumbnail")
				if _, err := s.EnsureThumbnail(item); err != nil {
					s.recordWarmupFailure(jobID, item.ID, item.Title, "thumbnail", err)
				} else {
					s.recordWarmupSuccess(jobID, item.ID, item.Title, "thumbnail")
				}

				select {
				case <-ctx.Done():
					return
				default:
				}

				s.updateCurrentItem(jobID, item.ID, item.Title, "hover")
				if _, err := s.EnsureHoverClip(item); err != nil {
					s.recordWarmupFailure(jobID, item.ID, item.Title, "hover", err)
				} else {
					s.recordWarmupSuccess(jobID, item.ID, item.Title, "hover")
				}
			}
		}()
	}

	for _, mediaID := range ids {
		select {
		case <-ctx.Done():
			close(mediaCh)
			wg.Wait()
			s.finishWarmup(jobID, "canceled")
			return
		case mediaCh <- mediaID:
		}
	}

	close(mediaCh)
	wg.Wait()

	if ctx.Err() != nil {
		s.finishWarmup(jobID, "canceled")
		return
	}

	s.finishWarmup(jobID, "completed")
}

func (s *Service) updateCurrentItem(jobID string, mediaID int64, title string, stage string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.currentJob == nil || s.currentJob.ID != jobID {
		return
	}

	s.currentJob.CurrentItemID = mediaID
	s.currentJob.CurrentTitle = title
	s.currentJob.CurrentStage = stage
}

func (s *Service) recordWarmupSuccess(jobID string, mediaID int64, title string, stage string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.currentJob == nil || s.currentJob.ID != jobID {
		return
	}

	s.currentJob.CurrentItemID = mediaID
	s.currentJob.CurrentTitle = title
	s.currentJob.CurrentStage = stage
	s.currentJob.CompletedSteps++
	s.currentJob.SucceededSteps++
	s.currentJob.ProgressPercent = computeProgressPercent(s.currentJob.CompletedSteps, s.currentJob.TotalSteps)
}

func (s *Service) recordWarmupFailure(jobID string, mediaID int64, title string, stage string, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.currentJob == nil || s.currentJob.ID != jobID {
		return
	}

	s.currentJob.CurrentItemID = mediaID
	s.currentJob.CurrentTitle = title
	s.currentJob.CurrentStage = stage
	s.currentJob.CompletedSteps++
	s.currentJob.FailedSteps++
	s.currentJob.ProgressPercent = computeProgressPercent(s.currentJob.CompletedSteps, s.currentJob.TotalSteps)

	if len(s.currentJob.Errors) < 10 {
		label := title
		if strings.TrimSpace(label) == "" {
			label = fmt.Sprintf("#%d", mediaID)
		}
		s.currentJob.Errors = append(s.currentJob.Errors, fmt.Sprintf("%s (%s): %v", label, stage, err))
	}
}

func (s *Service) finishWarmup(jobID string, status string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.currentJob == nil || s.currentJob.ID != jobID {
		return
	}

	s.currentJob.Status = status
	s.currentJob.ProgressPercent = computeProgressPercent(s.currentJob.CompletedSteps, s.currentJob.TotalSteps)
	s.currentJob.CurrentStage = ""
	s.currentJob.FinishedAt = time.Now().UTC().Format(time.RFC3339)
	if status == "completed" && s.currentJob.TotalSteps > 0 {
		s.currentJob.ProgressPercent = 100
	}
	s.currentCancel = nil
}

func cloneJobStatus(job *WarmupJobStatus) *WarmupJobStatus {
	if job == nil {
		return nil
	}

	clone := *job
	clone.Errors = append([]string{}, job.Errors...)
	return &clone
}

func computeProgressPercent(completed int, total int) int {
	if total <= 0 {
		return 0
	}
	if completed >= total {
		return 100
	}
	return int(float64(completed) / float64(total) * 100)
}

func previewWorkerCount(totalItems int) int {
	switch {
	case totalItems >= 12:
		return 3
	case totalItems >= 2:
		return 2
	default:
		return 1
	}
}

func dedupePreviewIDs(values []int64) []int64 {
	seen := map[int64]bool{}
	out := make([]int64, 0, len(values))

	for _, value := range values {
		if value <= 0 || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}

	return out
}

func (s *Service) EnsureThumbnail(item *library.MediaItem) (string, error) {
	cfg, err := s.ConfigService.Load()
	if err != nil {
		return "", err
	}

	ffmpegPath := s.ConfigService.ResolvePath(cfg.Tools.FFmpeg)
	if ffmpegPath == "" {
		return "", fmt.Errorf("ffmpeg path is empty")
	}

	sourcePath := s.ResolveMediaPath(item)
	if strings.TrimSpace(sourcePath) == "" {
		return "", fmt.Errorf("media path is empty")
	}

	cacheRoot := s.ConfigService.ResolvePath(cfg.Paths.PreviewCache)
	if cacheRoot == "" {
		return "", fmt.Errorf("preview cache path is empty")
	}

	outDir := filepath.Join(cacheRoot, "thumbs")
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return "", err
	}

	outPath := filepath.Join(outDir, fmt.Sprintf("%d.jpg", item.ID))
	if fresh, err := isFresh(sourcePath, outPath); err == nil && fresh {
		return outPath, nil
	}

	points := samplePoints(item.DurationSeconds, 5, 1.2)

	args := []string{"-y"}
	for _, point := range points {
		args = append(args,
			"-ss", formatSeconds(point),
			"-i", sourcePath,
		)
	}

	filterParts := make([]string, 0, 6)
	labels := make([]string, 0, len(points))

	for i := range points {
		filterParts = append(filterParts,
			fmt.Sprintf(
				"[%d:v]scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:black,setsar=1[v%d]",
				i, i,
			),
		)
		labels = append(labels, fmt.Sprintf("[v%d]", i))
	}

	filterParts = append(filterParts, fmt.Sprintf("%shstack=inputs=%d[v]", strings.Join(labels, ""), len(points)))

	args = append(args,
		"-filter_complex", strings.Join(filterParts, ";"),
		"-map", "[v]",
		"-frames:v", "1",
		outPath,
	)

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, ffmpegPath, args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("thumbnail strip generation failed: %v: %s", err, strings.TrimSpace(string(output)))
	}

	return outPath, nil
}

func (s *Service) EnsureHoverClip(item *library.MediaItem) (string, error) {
	cfg, err := s.ConfigService.Load()
	if err != nil {
		return "", err
	}

	ffmpegPath := s.ConfigService.ResolvePath(cfg.Tools.FFmpeg)
	if ffmpegPath == "" {
		return "", fmt.Errorf("ffmpeg path is empty")
	}

	sourcePath := s.ResolveMediaPath(item)
	if strings.TrimSpace(sourcePath) == "" {
		return "", fmt.Errorf("media path is empty")
	}

	cacheRoot := s.ConfigService.ResolvePath(cfg.Paths.PreviewCache)
	if cacheRoot == "" {
		return "", fmt.Errorf("preview cache path is empty")
	}

	outDir := filepath.Join(cacheRoot, "hover")
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return "", err
	}

	outPath := filepath.Join(outDir, fmt.Sprintf("%d.mp4", item.ID))
	if fresh, err := isFresh(sourcePath, outPath); err == nil && fresh {
		return outPath, nil
	}

	segmentDuration := 1.3
	points := samplePoints(item.DurationSeconds, 5, segmentDuration)

	args := []string{"-y"}
	for _, point := range points {
		args = append(args,
			"-ss", formatSeconds(point),
			"-t", formatSeconds(segmentDuration),
			"-i", sourcePath,
		)
	}

	filterParts := make([]string, 0, 6)
	labels := make([]string, 0, len(points))

	for i := range points {
		filterParts = append(filterParts,
			fmt.Sprintf(
				"[%d:v]scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=12[v%d]",
				i, i,
			),
		)
		labels = append(labels, fmt.Sprintf("[v%d]", i))
	}

	filterParts = append(filterParts, fmt.Sprintf("%sconcat=n=%d:v=1:a=0[v]", strings.Join(labels, ""), len(points)))

	args = append(args,
		"-filter_complex", strings.Join(filterParts, ";"),
		"-map", "[v]",
		"-an",
		"-c:v", "libx264",
		"-preset", "veryfast",
		"-crf", "30",
		"-pix_fmt", "yuv420p",
		"-movflags", "+faststart",
		outPath,
	)

	ctx, cancel := context.WithTimeout(context.Background(), 240*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, ffmpegPath, args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("hover preview generation failed: %v: %s", err, strings.TrimSpace(string(output)))
	}

	return outPath, nil
}

func isFresh(sourcePath string, targetPath string) (bool, error) {
	srcInfo, err := os.Stat(sourcePath)
	if err != nil {
		return false, err
	}

	dstInfo, err := os.Stat(targetPath)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}

	return !srcInfo.ModTime().After(dstInfo.ModTime()), nil
}

func samplePoints(duration float64, count int, segmentDuration float64) []float64 {
	if count <= 0 {
		return []float64{}
	}

	out := make([]float64, 0, count)

	if duration <= 0 {
		for i := 0; i < count; i++ {
			out = append(out, 0)
		}
		return out
	}

	anchors := []float64{0.02, 0.18, 0.38, 0.62, 0.86}
	safeEnd := duration - segmentDuration - 0.5
	if safeEnd < 0 {
		safeEnd = 0
	}

	for i := 0; i < count; i++ {
		ratio := float64(i) / float64(max(count-1, 1))
		if i < len(anchors) {
			ratio = anchors[i]
		}

		point := duration * ratio

		if point < 1 && safeEnd > 1 {
			point = 1
		}
		if point > safeEnd {
			point = safeEnd
		}
		if point < 0 {
			point = 0
		}

		out = append(out, point)
	}

	return out
}

func formatSeconds(value float64) string {
	return fmt.Sprintf("%.2f", value)
}

func max(a int, b int) int {
	if a > b {
		return a
	}
	return b
}
