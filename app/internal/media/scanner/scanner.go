package scanner

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"mediavault/internal/config"
	"mediavault/internal/library"
	"mediavault/internal/media/metadata"
)

type Service struct {
	ConfigService *config.Service
	LibraryRepo   *library.Repository
}

type Summary struct {
	Sources   int      `json:"sources"`
	FilesSeen int      `json:"files_seen"`
	Inserted  int      `json:"inserted"`
	Updated   int      `json:"updated"`
	Skipped   int      `json:"skipped"`
	Errors    []string `json:"errors"`
}

func NewService(cfg *config.Service, repo *library.Repository) *Service {
	return &Service{
		ConfigService: cfg,
		LibraryRepo:   repo,
	}
}

func (s *Service) ScanAll(ctx context.Context) (*Summary, error) {
	cfg, err := s.ConfigService.Load()
	if err != nil {
		return nil, err
	}

	ffprobePath := s.ConfigService.ResolvePath(cfg.Tools.FFprobe)
	if ffprobePath == "" {
		return nil, fmt.Errorf("ffprobe path is empty")
	}
	if _, err := os.Stat(ffprobePath); err != nil {
		return nil, fmt.Errorf("ffprobe not found at: %s", ffprobePath)
	}

	summary := &Summary{
		Sources: len(cfg.Paths.Sources),
		Errors:  []string{},
	}

	for _, rawSource := range cfg.Paths.Sources {
		source := s.ConfigService.ResolvePath(rawSource)
		if strings.TrimSpace(source) == "" {
			continue
		}

		info, err := os.Stat(source)
		if err != nil {
			summary.Errors = append(summary.Errors, fmt.Sprintf("source not found: %s", source))
			continue
		}
		if !info.IsDir() {
			summary.Errors = append(summary.Errors, fmt.Sprintf("source is not a directory: %s", source))
			continue
		}

		walkErr := filepath.WalkDir(source, func(path string, d fs.DirEntry, walkErr error) error {
			select {
			case <-ctx.Done():
				return ctx.Err()
			default:
			}

			if walkErr != nil {
				summary.Errors = append(summary.Errors, fmt.Sprintf("walk error at %s: %v", path, walkErr))
				return nil
			}

			if d.IsDir() {
				return nil
			}

			if !isSupportedVideo(path) {
				summary.Skipped++
				return nil
			}

			summary.FilesSeen++

			fileInfo, err := d.Info()
			if err != nil {
				summary.Errors = append(summary.Errors, fmt.Sprintf("file info error: %s: %v", path, err))
				return nil
			}

			probe, err := metadata.Probe(ffprobePath, path)
			if err != nil {
				summary.Errors = append(summary.Errors, fmt.Sprintf("ffprobe failed: %s: %v", path, err))
				return nil
			}

			baseName := filepath.Base(path)
			title := strings.TrimSuffix(baseName, filepath.Ext(baseName))
			if probe.Title != "" {
				title = probe.Title
			}

			season, episode := extractSeasonEpisode(baseName)

			item := &library.MediaItem{
				Title:           title,
				MediaType:       inferMediaType(season, episode),
				SourcePath:      path,
				CanonicalPath:   "",
				FileName:        baseName,
				Extension:       strings.ToLower(filepath.Ext(path)),
				DurationSeconds: probe.DurationSeconds,
				Width:           probe.Width,
				Height:          probe.Height,
				VideoCodec:      probe.VideoCodec,
				AudioCodec:      probe.AudioCodec,
				FilesizeBytes:   maxInt64(probe.FilesizeBytes, fileInfo.Size()),
				SeasonNumber:    season,
				EpisodeNumber:   episode,
				TypeSource:      "auto",
				TitleSource:     "auto",
				SequenceSource:  "auto",
			}

			status, err := s.LibraryRepo.Upsert(item)
			if err != nil {
				summary.Errors = append(summary.Errors, fmt.Sprintf("db upsert failed: %s: %v", path, err))
				return nil
			}

			if status == "inserted" {
				summary.Inserted++
			} else {
				summary.Updated++
			}

			return nil
		})

		if walkErr != nil && walkErr != context.Canceled {
			return nil, walkErr
		}
	}

	return summary, nil
}

func isSupportedVideo(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".m4v", ".webm", ".flv", ".mpeg", ".mpg", ".ts":
		return true
	default:
		return false
	}
}

func inferMediaType(season int, episode int) string {
	if season > 0 || episode > 0 {
		return "series_episode"
	}
	return "video"
}

var seasonEpisodeRegex = regexp.MustCompile(`(?i)s(\d{1,2})e(\d{1,2})`)

func extractSeasonEpisode(name string) (int, int) {
	matches := seasonEpisodeRegex.FindStringSubmatch(name)
	if len(matches) != 3 {
		return 0, 0
	}

	season := atoiSafe(matches[1])
	episode := atoiSafe(matches[2])
	return season, episode
}

func atoiSafe(value string) int {
	n := 0
	for _, ch := range value {
		if ch < '0' || ch > '9' {
			return 0
		}
		n = (n * 10) + int(ch-'0')
	}
	return n
}

func maxInt64(a int64, b int64) int64 {
	if a > b {
		return a
	}
	return b
}