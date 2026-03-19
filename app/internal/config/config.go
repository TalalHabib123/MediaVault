package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type AppConfig struct {
	Server struct {
		Host string `json:"host"`
		Port int    `json:"port"`
	} `json:"server"`

	Paths struct {
		Sources      []string `json:"sources"`
		LibraryRoot  string   `json:"library_root"`
		ViewsRoot    string   `json:"views_root"`
		PreviewCache string   `json:"preview_cache"`
	} `json:"paths"`

	Tools struct {
		FFmpeg  string `json:"ffmpeg"`
		FFprobe string `json:"ffprobe"`
		VLC     string `json:"vlc"`
	} `json:"tools"`

	Mode struct {
		Portable bool `json:"portable"`
	} `json:"mode"`
}

type Service struct {
	rootDir    string
	configPath string
}

func NewService(rootDir string) *Service {
	return &Service{
		rootDir:    rootDir,
		configPath: filepath.Join(rootDir, "config", "config.json"),
	}
}

func (s *Service) RootDir() string {
	return s.rootDir
}

func (s *Service) ConfigPath() string {
	return s.configPath
}

func (s *Service) ResolvePath(value string) string {
	if value == "" {
		return ""
	}
	if filepath.IsAbs(value) {
		return filepath.Clean(value)
	}
	return filepath.Clean(filepath.Join(s.rootDir, value))
}

func (s *Service) Load() (*AppConfig, error) {
	if err := os.MkdirAll(filepath.Join(s.rootDir, "config"), 0o755); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Join(s.rootDir, "data"), 0o755); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Join(s.rootDir, "logs"), 0o755); err != nil {
		return nil, err
	}

	if _, err := os.Stat(s.configPath); os.IsNotExist(err) {
		cfg := DefaultConfig()
		if err := s.Save(cfg); err != nil {
			return nil, err
		}
		return cfg, nil
	}

	raw, err := os.ReadFile(s.configPath)
	if err != nil {
		return nil, err
	}

	var cfg AppConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, err
	}

	if cfg.Server.Host == "" {
		cfg.Server.Host = "127.0.0.1"
	}
	if cfg.Server.Port == 0 {
		cfg.Server.Port = 8090
	}
	if cfg.Paths.PreviewCache == "" {
		cfg.Paths.PreviewCache = "./data/previews"
	}
	if cfg.Tools.FFmpeg == "" {
		cfg.Tools.FFmpeg = "./bin/ffmpeg.exe"
	}
	if cfg.Tools.FFprobe == "" {
		cfg.Tools.FFprobe = "./bin/ffprobe.exe"
	}

	return &cfg, nil
}

func (s *Service) Save(cfg *AppConfig) error {
	if err := os.MkdirAll(filepath.Dir(s.configPath), 0o755); err != nil {
		return err
	}

	raw, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.configPath, raw, 0o644)
}

func DefaultConfig() *AppConfig {
	var cfg AppConfig
	cfg.Server.Host = "127.0.0.1"
	cfg.Server.Port = 8090

	cfg.Paths.Sources = []string{}
	cfg.Paths.LibraryRoot = ""
	cfg.Paths.ViewsRoot = ""
	cfg.Paths.PreviewCache = "./data/previews"

	cfg.Tools.FFmpeg = "./bin/ffmpeg.exe"
	cfg.Tools.FFprobe = "./bin/ffprobe.exe"
	cfg.Tools.VLC = ""

	cfg.Mode.Portable = true

	return &cfg
}