package playback

import (
	"context"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"mediavault/internal/config"
	"mediavault/internal/library"
)

const (
	ModeAuto   = "auto"
	ModeDirect = "direct"
	ModeMP4    = "mp4"
	ModeHLS    = "hls"

	StatusReady     = "ready"
	StatusPreparing = "preparing"
	StatusError     = "error"
)

type PlaybackStatus struct {
	Status          string  `json:"status"`
	Mode            string  `json:"mode"`
	StreamURL       string  `json:"stream_url"`
	HLSManifestURL  string  `json:"hls_manifest_url"`
	Seekable        bool    `json:"seekable"`
	DurationSeconds float64 `json:"duration_seconds"`
	Message         string  `json:"message"`
}

type Service struct {
	ConfigService *config.Service

	mu        sync.Mutex
	jobs      map[string]*generationJob
	generator generatorFunc
}

type generationJob struct {
	key     string
	status  string
	message string
}

type generatorFunc func(ctx context.Context, item *library.MediaItem, sourcePath string, target playbackTarget) error

type playbackTarget struct {
	Mode       string
	OutputPath string
	Partial    string
	HLSDir     string
	PartialDir string
}

type hlsVariant struct {
	Name    string
	Height  int
	Bitrate string
	Peak    int
}

func NewService(cfg *config.Service) *Service {
	s := &Service{
		ConfigService: cfg,
		jobs:          map[string]*generationJob{},
	}
	s.generator = s.generatePlaybackAsset
	return s
}

func (s *Service) Status(item *library.MediaItem, sourcePath string, requestedMode string, remote bool, start bool) (*PlaybackStatus, error) {
	sourcePath = strings.TrimSpace(sourcePath)
	if sourcePath == "" {
		return nil, fmt.Errorf("media path is empty")
	}
	if item == nil {
		return nil, fmt.Errorf("media item is nil")
	}

	mode := s.resolveMode(item, sourcePath, requestedMode, remote)
	if mode == ModeDirect {
		if _, err := os.Stat(sourcePath); err != nil {
			return nil, err
		}
		return readyStatus(item, ModeDirect), nil
	}

	target, err := s.targetFor(item, mode)
	if err != nil {
		return nil, err
	}
	if fresh, err := isFresh(sourcePath, target.OutputPath); err == nil && fresh {
		return readyStatus(item, mode), nil
	}

	key := jobKey(item.ID, mode)
	if start {
		job := s.startJob(key, item, sourcePath, target)
		if job.status == StatusError {
			return preparingStatus(item, mode, job.status, job.message), nil
		}
		return preparingStatus(item, mode, StatusPreparing, "Preparing seekable playback cache."), nil
	}

	s.mu.Lock()
	job := s.jobs[key]
	s.mu.Unlock()
	if job != nil {
		return preparingStatus(item, mode, job.status, job.message), nil
	}

	return preparingStatus(item, mode, StatusPreparing, "Playback cache is not ready yet."), nil
}

func (s *Service) Serve(w http.ResponseWriter, r *http.Request, item *library.MediaItem, sourcePath string) error {
	sourcePath = strings.TrimSpace(sourcePath)
	if sourcePath == "" {
		return fmt.Errorf("media path is empty")
	}
	if item == nil {
		return fmt.Errorf("media item is nil")
	}

	if CanServeDirectlyToBrowser(item, sourcePath) {
		return serveDirect(w, r, sourcePath)
	}

	target, err := s.targetFor(item, ModeMP4)
	if err != nil {
		return err
	}
	if fresh, err := isFresh(sourcePath, target.OutputPath); err != nil {
		return err
	} else if !fresh {
		return &NotReadyError{Mode: ModeMP4}
	}

	return serveFile(w, r, target.OutputPath, "video/mp4")
}

func (s *Service) ServeHLS(w http.ResponseWriter, r *http.Request, item *library.MediaItem, sourcePath string, assetPath string) error {
	sourcePath = strings.TrimSpace(sourcePath)
	if sourcePath == "" {
		return fmt.Errorf("media path is empty")
	}
	if item == nil {
		return fmt.Errorf("media item is nil")
	}

	target, err := s.targetFor(item, ModeHLS)
	if err != nil {
		return err
	}
	if fresh, err := isFresh(sourcePath, target.OutputPath); err != nil {
		return err
	} else if !fresh {
		return &NotReadyError{Mode: ModeHLS}
	}

	cleanAsset, ok := cleanRelativeAssetPath(assetPath)
	if !ok {
		return fmt.Errorf("invalid hls asset path")
	}
	fullPath := filepath.Join(target.HLSDir, cleanAsset)
	if rel, err := filepath.Rel(target.HLSDir, fullPath); err != nil || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		return fmt.Errorf("invalid hls asset path")
	}

	contentType := mime.TypeByExtension(filepath.Ext(fullPath))
	switch strings.ToLower(filepath.Ext(fullPath)) {
	case ".m3u8":
		contentType = "application/vnd.apple.mpegurl"
	case ".ts":
		contentType = "video/mp2t"
	}

	return serveFile(w, r, fullPath, contentType)
}

func (s *Service) resolveMode(item *library.MediaItem, sourcePath string, requestedMode string, remote bool) string {
	switch strings.ToLower(strings.TrimSpace(requestedMode)) {
	case ModeHLS:
		return ModeHLS
	case ModeMP4:
		if CanServeDirectlyToBrowser(item, sourcePath) {
			return ModeDirect
		}
		return ModeMP4
	default:
		if remote {
			return ModeHLS
		}
		if CanServeDirectlyToBrowser(item, sourcePath) {
			return ModeDirect
		}
		return ModeMP4
	}
}

func (s *Service) targetFor(item *library.MediaItem, mode string) (playbackTarget, error) {
	cfg, err := s.ConfigService.Load()
	if err != nil {
		return playbackTarget{}, err
	}

	cacheRoot := s.ConfigService.ResolvePath(cfg.Paths.PreviewCache)
	if strings.TrimSpace(cacheRoot) == "" {
		return playbackTarget{}, fmt.Errorf("preview cache path is empty")
	}

	switch mode {
	case ModeMP4:
		outPath := filepath.Join(cacheRoot, "playback", "mp4", fmt.Sprintf("%d.mp4", item.ID))
		return playbackTarget{
			Mode:       ModeMP4,
			OutputPath: outPath,
			Partial:    outPath + ".partial",
		}, nil
	case ModeHLS:
		hlsDir := filepath.Join(cacheRoot, "playback", "hls", fmt.Sprintf("%d", item.ID))
		partialDir := hlsDir + fmt.Sprintf(".partial-%d", time.Now().UTC().UnixNano())
		return playbackTarget{
			Mode:       ModeHLS,
			OutputPath: filepath.Join(hlsDir, "master.m3u8"),
			HLSDir:     hlsDir,
			PartialDir: partialDir,
		}, nil
	default:
		return playbackTarget{}, fmt.Errorf("unsupported playback mode: %s", mode)
	}
}

func (s *Service) startJob(key string, item *library.MediaItem, sourcePath string, target playbackTarget) *generationJob {
	s.mu.Lock()
	if s.jobs == nil {
		s.jobs = map[string]*generationJob{}
	}
	if existing := s.jobs[key]; existing != nil {
		clone := *existing
		s.mu.Unlock()
		return &clone
	}

	job := &generationJob{
		key:     key,
		status:  StatusPreparing,
		message: "Preparing seekable playback cache.",
	}
	s.jobs[key] = job
	s.mu.Unlock()

	go func() {
		err := s.generator(context.Background(), cloneMediaItem(item), sourcePath, target)

		s.mu.Lock()
		defer s.mu.Unlock()
		if current := s.jobs[key]; current != job {
			return
		}
		if err != nil {
			job.status = StatusError
			job.message = err.Error()
			return
		}
		delete(s.jobs, key)
	}()

	clone := *job
	return &clone
}

func (s *Service) generatePlaybackAsset(ctx context.Context, item *library.MediaItem, sourcePath string, target playbackTarget) error {
	cfg, err := s.ConfigService.Load()
	if err != nil {
		return err
	}

	ffmpegPath := s.ConfigService.ResolvePath(cfg.Tools.FFmpeg)
	if ffmpegPath == "" {
		return fmt.Errorf("ffmpeg path is empty")
	}
	if _, err := os.Stat(ffmpegPath); err != nil {
		return fmt.Errorf("ffmpeg not found at: %s", ffmpegPath)
	}
	if _, err := os.Stat(sourcePath); err != nil {
		return err
	}

	switch target.Mode {
	case ModeMP4:
		return generateMP4(ctx, ffmpegPath, item, sourcePath, target)
	case ModeHLS:
		return generateHLS(ctx, ffmpegPath, item, sourcePath, target)
	default:
		return fmt.Errorf("unsupported playback mode: %s", target.Mode)
	}
}

func generateMP4(ctx context.Context, ffmpegPath string, item *library.MediaItem, sourcePath string, target playbackTarget) error {
	if err := os.MkdirAll(filepath.Dir(target.OutputPath), 0o755); err != nil {
		return err
	}
	_ = os.Remove(target.Partial)

	args := transcodeMP4Args(sourcePath, target.Partial)
	if CanRemuxToMP4(item, sourcePath) {
		args = remuxMP4Args(sourcePath, target.Partial)
	}

	if output, err := exec.CommandContext(ctx, ffmpegPath, args...).CombinedOutput(); err != nil {
		_ = os.Remove(target.Partial)
		return fmt.Errorf("mp4 playback cache generation failed: %v: %s", err, strings.TrimSpace(string(output)))
	}

	_ = os.Remove(target.OutputPath)
	if err := os.Rename(target.Partial, target.OutputPath); err != nil {
		_ = os.Remove(target.Partial)
		return err
	}
	return nil
}

func generateHLS(ctx context.Context, ffmpegPath string, item *library.MediaItem, sourcePath string, target playbackTarget) error {
	if err := os.MkdirAll(filepath.Dir(target.HLSDir), 0o755); err != nil {
		return err
	}
	_ = os.RemoveAll(target.PartialDir)
	if err := os.MkdirAll(target.PartialDir, 0o755); err != nil {
		return err
	}

	variants := hlsVariantsFor(item.Height)
	for _, variant := range variants {
		args := hlsVariantArgs(sourcePath, target.PartialDir, variant)
		if output, err := exec.CommandContext(ctx, ffmpegPath, args...).CombinedOutput(); err != nil {
			_ = os.RemoveAll(target.PartialDir)
			return fmt.Errorf("hls playback cache generation failed (%s): %v: %s", variant.Name, err, strings.TrimSpace(string(output)))
		}
	}

	if err := os.WriteFile(filepath.Join(target.PartialDir, "master.m3u8"), []byte(masterPlaylist(variants)), 0o644); err != nil {
		_ = os.RemoveAll(target.PartialDir)
		return err
	}

	_ = os.RemoveAll(target.HLSDir)
	if err := os.Rename(target.PartialDir, target.HLSDir); err != nil {
		_ = os.RemoveAll(target.PartialDir)
		return err
	}
	return nil
}

func CanServeDirectlyToBrowser(item *library.MediaItem, sourcePath string) bool {
	if item == nil {
		return false
	}

	ext := mediaExtension(item, sourcePath)
	videoCodec := normalizeCodec(item.VideoCodec)
	audioCodec := normalizeCodec(item.AudioCodec)
	if videoCodec == "" || audioCodec == "" {
		return false
	}

	switch ext {
	case ".mp4", ".m4v", ".mov":
		return isH264(videoCodec) && isMP4Audio(audioCodec)
	case ".webm":
		return isWebMVideo(videoCodec) && isWebMAudio(audioCodec)
	default:
		return false
	}
}

func CanRemuxToMP4(item *library.MediaItem, sourcePath string) bool {
	if item == nil {
		return false
	}
	videoCodec := normalizeCodec(item.VideoCodec)
	audioCodec := normalizeCodec(item.AudioCodec)
	return isH264(videoCodec) && isMP4Audio(audioCodec) && mediaExtension(item, sourcePath) != ".webm"
}

func serveDirect(w http.ResponseWriter, r *http.Request, sourcePath string) error {
	contentType := mime.TypeByExtension(filepath.Ext(sourcePath))
	return serveFile(w, r, sourcePath, contentType)
}

func serveFile(w http.ResponseWriter, r *http.Request, path string, contentType string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return err
	}

	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	w.Header().Set("Cache-Control", "private, max-age=86400")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	http.ServeContent(w, r, filepath.Base(path), info.ModTime(), file)
	return nil
}

func remuxMP4Args(sourcePath string, outPath string) []string {
	return []string{
		"-hide_banner",
		"-loglevel", "error",
		"-y",
		"-i", sourcePath,
		"-map", "0:v:0",
		"-map", "0:a:0?",
		"-dn",
		"-sn",
		"-c", "copy",
		"-movflags", "+faststart",
		outPath,
	}
}

func transcodeMP4Args(sourcePath string, outPath string) []string {
	return []string{
		"-hide_banner",
		"-loglevel", "error",
		"-y",
		"-i", sourcePath,
		"-map", "0:v:0",
		"-map", "0:a:0?",
		"-dn",
		"-sn",
		"-c:v", "libx264",
		"-preset", "veryfast",
		"-crf", "23",
		"-pix_fmt", "yuv420p",
		"-c:a", "aac",
		"-b:a", "160k",
		"-ac", "2",
		"-movflags", "+faststart",
		outPath,
	}
}

func hlsVariantArgs(sourcePath string, outDir string, variant hlsVariant) []string {
	playlistPath := filepath.Join(outDir, variant.Name+".m3u8")
	segmentPath := filepath.Join(outDir, variant.Name+"_%05d.ts")
	return []string{
		"-hide_banner",
		"-loglevel", "error",
		"-y",
		"-i", sourcePath,
		"-map", "0:v:0",
		"-map", "0:a:0?",
		"-dn",
		"-sn",
		"-vf", fmt.Sprintf("scale=-2:%d", variant.Height),
		"-c:v", "libx264",
		"-preset", "veryfast",
		"-b:v", variant.Bitrate,
		"-maxrate", variant.Bitrate,
		"-bufsize", hlsBufferSize(variant.Bitrate),
		"-pix_fmt", "yuv420p",
		"-c:a", "aac",
		"-b:a", "128k",
		"-ac", "2",
		"-hls_time", "6",
		"-hls_playlist_type", "vod",
		"-hls_segment_filename", segmentPath,
		playlistPath,
	}
}

func hlsVariantsFor(sourceHeight int) []hlsVariant {
	candidates := []hlsVariant{
		{Name: "720p", Height: 720, Bitrate: "2800k", Peak: 3000000},
		{Name: "480p", Height: 480, Bitrate: "1400k", Peak: 1600000},
		{Name: "360p", Height: 360, Bitrate: "800k", Peak: 1000000},
	}

	out := make([]hlsVariant, 0, len(candidates))
	for _, candidate := range candidates {
		if sourceHeight <= 0 || candidate.Height <= sourceHeight {
			out = append(out, candidate)
		}
	}
	if len(out) == 0 {
		return []hlsVariant{candidates[len(candidates)-1]}
	}
	return out
}

func masterPlaylist(variants []hlsVariant) string {
	var b strings.Builder
	b.WriteString("#EXTM3U\n")
	b.WriteString("#EXT-X-VERSION:3\n")
	for _, variant := range variants {
		b.WriteString(fmt.Sprintf("#EXT-X-STREAM-INF:BANDWIDTH=%d,RESOLUTION=%dx%d\n", variant.Peak, scaledWidth(variant.Height), variant.Height))
		b.WriteString(variant.Name + ".m3u8\n")
	}
	return b.String()
}

func hlsBufferSize(bitrate string) string {
	value := strings.TrimSuffix(bitrate, "k")
	return value + "k"
}

func scaledWidth(height int) int {
	if height <= 0 {
		return 640
	}
	width := height * 16 / 9
	if width%2 != 0 {
		width++
	}
	return width
}

func isFresh(sourcePath string, targetPath string) (bool, error) {
	srcInfo, err := os.Stat(sourcePath)
	if err != nil {
		return false, err
	}

	dstInfo, err := os.Stat(targetPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, nil
		}
		return false, err
	}

	return !srcInfo.ModTime().After(dstInfo.ModTime()), nil
}

func mediaExtension(item *library.MediaItem, sourcePath string) string {
	ext := strings.ToLower(strings.TrimSpace(filepath.Ext(sourcePath)))
	if ext != "" {
		return ext
	}

	ext = strings.ToLower(strings.TrimSpace(item.Extension))
	if ext == "" {
		return ""
	}
	if strings.HasPrefix(ext, ".") {
		return ext
	}
	return "." + ext
}

func normalizeCodec(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func isH264(codec string) bool {
	switch codec {
	case "h264", "avc1":
		return true
	default:
		return false
	}
}

func isMP4Audio(codec string) bool {
	switch codec {
	case "aac", "mp3", "mp4a":
		return true
	default:
		return false
	}
}

func isWebMVideo(codec string) bool {
	switch codec {
	case "vp8", "vp9", "av1":
		return true
	default:
		return false
	}
}

func isWebMAudio(codec string) bool {
	switch codec {
	case "opus", "vorbis":
		return true
	default:
		return false
	}
}

func readyStatus(item *library.MediaItem, mode string) *PlaybackStatus {
	status := &PlaybackStatus{
		Status:          StatusReady,
		Mode:            mode,
		Seekable:        true,
		DurationSeconds: item.DurationSeconds,
	}

	switch mode {
	case ModeDirect, ModeMP4:
		status.StreamURL = fmt.Sprintf("/api/library/%d/stream", item.ID)
	case ModeHLS:
		status.HLSManifestURL = fmt.Sprintf("/api/library/%d/playback/hls/master.m3u8", item.ID)
	}

	return status
}

func preparingStatus(item *library.MediaItem, mode string, status string, message string) *PlaybackStatus {
	if status == "" {
		status = StatusPreparing
	}
	if strings.TrimSpace(message) == "" {
		message = "Preparing seekable playback cache."
	}
	return &PlaybackStatus{
		Status:          status,
		Mode:            mode,
		StreamURL:       fmt.Sprintf("/api/library/%d/stream", item.ID),
		HLSManifestURL:  fmt.Sprintf("/api/library/%d/playback/hls/master.m3u8", item.ID),
		Seekable:        false,
		DurationSeconds: item.DurationSeconds,
		Message:         message,
	}
}

func jobKey(mediaID int64, mode string) string {
	return fmt.Sprintf("%d:%s", mediaID, mode)
}

func cloneMediaItem(item *library.MediaItem) *library.MediaItem {
	if item == nil {
		return nil
	}
	clone := *item
	return &clone
}

func cleanRelativeAssetPath(value string) (string, bool) {
	value = strings.TrimSpace(strings.TrimPrefix(value, "/"))
	if value == "" {
		return "", false
	}
	cleaned := filepath.Clean(value)
	if cleaned == "." || strings.HasPrefix(cleaned, "..") || filepath.IsAbs(cleaned) {
		return "", false
	}
	return cleaned, true
}

type NotReadyError struct {
	Mode string
}

func (e *NotReadyError) Error() string {
	return fmt.Sprintf("%s playback cache is not ready", e.Mode)
}
