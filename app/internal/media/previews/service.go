package previews

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"mediavault/internal/config"
	"mediavault/internal/library"
)

type Service struct {
	ConfigService *config.Service
}

func NewService(cfg *config.Service) *Service {
	return &Service{ConfigService: cfg}
}

func (s *Service) ResolveMediaPath(item *library.MediaItem) string {
	if strings.TrimSpace(item.CanonicalPath) != "" {
		return item.CanonicalPath
	}
	return item.SourcePath
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
