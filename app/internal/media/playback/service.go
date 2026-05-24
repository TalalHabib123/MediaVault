package playback

import (
	"bytes"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
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

func (s *Service) Serve(w http.ResponseWriter, r *http.Request, item *library.MediaItem, sourcePath string) error {
	sourcePath = strings.TrimSpace(sourcePath)
	if sourcePath == "" {
		return fmt.Errorf("media path is empty")
	}

	if CanServeDirectlyToBrowser(item, sourcePath) {
		return serveDirect(w, r, sourcePath)
	}

	return s.serveCompatibleMP4(w, r, sourcePath)
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

func serveDirect(w http.ResponseWriter, r *http.Request, sourcePath string) error {
	file, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return err
	}

	if contentType := mime.TypeByExtension(filepath.Ext(sourcePath)); contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}

	http.ServeContent(w, r, filepath.Base(sourcePath), info.ModTime(), file)
	return nil
}

func (s *Service) serveCompatibleMP4(w http.ResponseWriter, r *http.Request, sourcePath string) error {
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

	cmd := exec.CommandContext(r.Context(), ffmpegPath, compatibleMP4Args(sourcePath)...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("stream transcoder failed to start: %w", err)
	}

	w.Header().Set("Content-Type", "video/mp4")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Accept-Ranges", "none")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	copyErr := copyAndFlush(w, stdout)
	waitErr := cmd.Wait()
	if r.Context().Err() != nil {
		return nil
	}
	if copyErr != nil || waitErr != nil {
		return nil
	}

	return nil
}

func compatibleMP4Args(sourcePath string) []string {
	return []string{
		"-hide_banner",
		"-loglevel", "error",
		"-fflags", "+genpts",
		"-i", sourcePath,
		"-map", "0:v:0",
		"-map", "0:a:0?",
		"-dn",
		"-sn",
		"-c:v", "libx264",
		"-preset", "veryfast",
		"-pix_fmt", "yuv420p",
		"-c:a", "aac",
		"-b:a", "160k",
		"-ac", "2",
		"-movflags", "frag_keyframe+empty_moov+default_base_moof",
		"-f", "mp4",
		"pipe:1",
	}
}

func copyAndFlush(w http.ResponseWriter, src io.Reader) error {
	flusher, ok := w.(http.Flusher)
	if !ok {
		_, err := io.Copy(w, src)
		return err
	}

	_, err := io.Copy(flushWriter{w: w, flusher: flusher}, src)
	return err
}

type flushWriter struct {
	w       http.ResponseWriter
	flusher http.Flusher
}

func (w flushWriter) Write(p []byte) (int, error) {
	n, err := w.w.Write(p)
	w.flusher.Flush()
	return n, err
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
