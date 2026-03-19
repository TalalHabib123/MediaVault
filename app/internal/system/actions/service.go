package actions

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"mediavault/internal/config"
	"mediavault/internal/library"
)

type Service struct {
	ConfigService *config.Service
}

func NewService(cfg *config.Service) *Service {
	return &Service{ConfigService: cfg}
}

func (s *Service) OpenInVLC(item *library.MediaItem) error {
	cfg, err := s.ConfigService.Load()
	if err != nil {
		return err
	}

	vlcPath := s.ConfigService.ResolvePath(cfg.Tools.VLC)
	if strings.TrimSpace(vlcPath) == "" {
		return fmt.Errorf("vlc path is not configured")
	}
	if _, err := os.Stat(vlcPath); err != nil {
		return fmt.Errorf("vlc executable not found: %s", vlcPath)
	}

	mediaPath := currentMediaPath(item)
	if strings.TrimSpace(mediaPath) == "" {
		return fmt.Errorf("media path is empty")
	}
	if _, err := os.Stat(mediaPath); err != nil {
		return fmt.Errorf("media file not found: %s", mediaPath)
	}

	cmd := exec.Command(vlcPath, mediaPath)
	return cmd.Start()
}

func (s *Service) RevealInFolder(item *library.MediaItem) error {
	mediaPath := currentMediaPath(item)
	if strings.TrimSpace(mediaPath) == "" {
		return fmt.Errorf("media path is empty")
	}
	if _, err := os.Stat(mediaPath); err != nil {
		return fmt.Errorf("media file not found: %s", mediaPath)
	}

	cmd := exec.Command("explorer.exe", "/select,", mediaPath)
	return cmd.Start()
}

func currentMediaPath(item *library.MediaItem) string {
	if strings.TrimSpace(item.CanonicalPath) != "" {
		return item.CanonicalPath
	}
	return item.SourcePath
}
