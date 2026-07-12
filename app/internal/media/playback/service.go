package playback

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"mediavault/internal/config"
	"mediavault/internal/library"
)

const (
	ModeDirect    = "direct"
	ModeSmoothHLS = "smooth_hls"

	QualityAuto     = "auto"
	QualityOriginal = "original"
	Quality720p     = "720p"
	Quality480p     = "480p"
	Quality360p     = "360p"

	defaultSegmentSeconds = 8.0
	prefetchSegmentCount  = 2
)

type PlaybackPlan struct {
	Mode            string  `json:"mode"`
	StreamURL       string  `json:"stream_url"`
	SessionURL      string  `json:"session_url"`
	ManifestURL     string  `json:"manifest_url"`
	Seekable        bool    `json:"seekable"`
	DurationSeconds float64 `json:"duration_seconds"`
	Quality         string  `json:"quality"`
	Message         string  `json:"message"`
}

type SessionInput struct {
	StartSeconds float64 `json:"start_seconds"`
	Quality      string  `json:"quality"`
}

type SessionInfo struct {
	SessionID    string  `json:"session_id"`
	ManifestURL  string  `json:"manifest_url"`
	Quality      string  `json:"quality"`
	StartSeconds float64 `json:"start_seconds"`
}

type Service struct {
	ConfigService *config.Service

	mu               sync.Mutex
	sessions         map[string]*Session
	segmentGenerator segmentGeneratorFunc
}

type Session struct {
	ID              string
	MediaID         int64
	SourcePath      string
	FFmpegPath      string
	Dir             string
	Quality         string
	Profile         smoothProfile
	Item            library.MediaItem
	DurationSeconds float64
	SegmentSeconds  float64
	SegmentCount    int
	StartedAt       time.Time

	ctx    context.Context
	cancel context.CancelFunc

	mu   sync.Mutex
	jobs map[int]*segmentJob
}

type segmentJob struct {
	done chan struct{}
	err  error
}

type smoothProfile struct {
	Quality string
	Height  int
	Bitrate string
	Bufsize string
	CRF     string
}

type segmentGeneratorFunc func(ctx context.Context, ffmpegPath string, sourcePath string, outPath string, item library.MediaItem, profile smoothProfile, startSeconds float64, durationSeconds float64) error

func NewService(cfg *config.Service) *Service {
	return &Service{
		ConfigService:    cfg,
		sessions:         map[string]*Session{},
		segmentGenerator: runFFmpegSegment,
	}
}

func (s *Service) Plan(item *library.MediaItem, sourcePath string, remote bool) (*PlaybackPlan, error) {
	sourcePath = strings.TrimSpace(sourcePath)
	if sourcePath == "" {
		return nil, fmt.Errorf("media path is empty")
	}
	if item == nil {
		return nil, fmt.Errorf("media item is nil")
	}
	if _, err := os.Stat(sourcePath); err != nil {
		return nil, err
	}

	plan := &PlaybackPlan{
		Mode:            ModeSmoothHLS,
		StreamURL:       fmt.Sprintf("/api/library/%d/stream", item.ID),
		SessionURL:      fmt.Sprintf("/api/library/%d/playback/session", item.ID),
		Seekable:        true,
		DurationSeconds: item.DurationSeconds,
		Quality:         QualityAuto,
		Message:         "Smooth playback creates temporary browser-compatible segments only while watching.",
	}

	if CanServeDirectlyToBrowser(item, sourcePath) {
		plan.Mode = ModeDirect
		plan.Quality = QualityOriginal
		if remote {
			plan.Message = "Original seekable byte-range stream. Switch to Smooth only if remote playback buffers."
		} else {
			plan.Message = "Original file can play directly with full duration and seeking."
		}
	}

	return plan, nil
}

func (s *Service) Serve(w http.ResponseWriter, r *http.Request, _ *library.MediaItem, sourcePath string) error {
	sourcePath = strings.TrimSpace(sourcePath)
	if sourcePath == "" {
		return fmt.Errorf("media path is empty")
	}
	contentType := mime.TypeByExtension(filepath.Ext(sourcePath))
	return serveFile(w, r, sourcePath, contentType, "private, max-age=86400")
}

func (s *Service) StartSession(item *library.MediaItem, sourcePath string, input SessionInput) (*SessionInfo, error) {
	sourcePath = strings.TrimSpace(sourcePath)
	if sourcePath == "" {
		return nil, fmt.Errorf("media path is empty")
	}
	if item == nil {
		return nil, fmt.Errorf("media item is nil")
	}
	if item.DurationSeconds <= 0 {
		return nil, fmt.Errorf("media duration is unknown; smooth playback needs duration metadata")
	}
	if _, err := os.Stat(sourcePath); err != nil {
		return nil, err
	}

	cfg, err := s.ConfigService.Load()
	if err != nil {
		return nil, err
	}

	ffmpegPath := s.ConfigService.ResolvePath(cfg.Tools.FFmpeg)
	if ffmpegPath == "" {
		return nil, fmt.Errorf("ffmpeg path is empty")
	}
	if _, err := os.Stat(ffmpegPath); err != nil {
		return nil, fmt.Errorf("ffmpeg not found at: %s", ffmpegPath)
	}

	startSeconds := clampStart(input.StartSeconds, item.DurationSeconds)
	profile := smoothProfileFor(input.Quality, item.Height)
	id, err := newSessionID()
	if err != nil {
		return nil, err
	}

	outDir := filepath.Join(sessionRoot(), id)
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return nil, err
	}

	ctx, cancel := context.WithCancel(context.Background())
	session := &Session{
		ID:              id,
		MediaID:         item.ID,
		SourcePath:      sourcePath,
		FFmpegPath:      ffmpegPath,
		Dir:             outDir,
		Quality:         profile.Quality,
		Profile:         profile,
		Item:            *cloneMediaItem(item),
		DurationSeconds: item.DurationSeconds,
		SegmentSeconds:  defaultSegmentSeconds,
		SegmentCount:    segmentCount(item.DurationSeconds, defaultSegmentSeconds),
		StartedAt:       time.Now().UTC(),
		ctx:             ctx,
		cancel:          cancel,
		jobs:            map[int]*segmentJob{},
	}

	s.mu.Lock()
	if s.sessions == nil {
		s.sessions = map[string]*Session{}
	}
	s.sessions[id] = session
	s.mu.Unlock()

	return &SessionInfo{
		SessionID:    id,
		ManifestURL:  fmt.Sprintf("/api/playback/sessions/%s/index.m3u8", id),
		Quality:      session.Quality,
		StartSeconds: startSeconds,
	}, nil
}

func (s *Service) ServeSessionAsset(w http.ResponseWriter, r *http.Request, sessionID string, assetPath string) error {
	session := s.getSession(sessionID)
	if session == nil {
		return ErrSessionNotFound
	}

	cleanAsset, ok := cleanRelativeAssetPath(assetPath)
	if !ok {
		return fmt.Errorf("invalid session asset path")
	}
	if cleanAsset == "index.m3u8" {
		return serveSessionManifest(w, r, session)
	}

	index, ok := segmentIndex(cleanAsset)
	if !ok {
		return os.ErrNotExist
	}
	if err := s.ensureSegment(session, index); err != nil {
		return err
	}

	go s.prefetchSegments(session.ID, index+1, prefetchSegmentCount)

	return serveFile(w, r, session.segmentPath(index), "video/mp2t", "private, max-age=3600")
}

func (s *Service) StopSession(sessionID string) error {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return nil
	}

	s.mu.Lock()
	session := s.sessions[sessionID]
	delete(s.sessions, sessionID)
	s.mu.Unlock()
	if session == nil {
		return nil
	}

	session.cancel()
	waitForJobs(session, 2*time.Second)
	return os.RemoveAll(session.Dir)
}

func (s *Service) CleanupLegacyPlaybackCache() bool {
	if s == nil || s.ConfigService == nil {
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

	return os.RemoveAll(filepath.Join(cacheRoot, "playback")) == nil
}

func (s *Service) CleanupSessionTemp() bool {
	return os.RemoveAll(sessionRoot()) == nil
}

func (s *Service) getSession(sessionID string) *Session {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sessions[strings.TrimSpace(sessionID)]
}

func (s *Service) ensureSegment(session *Session, index int) error {
	if session == nil || index < 0 || index >= session.SegmentCount {
		return os.ErrNotExist
	}
	if session.ctx.Err() != nil {
		return session.ctx.Err()
	}
	if fileReady(session.segmentPath(index)) {
		return nil
	}

	job, owner := session.beginSegmentJob(index)
	if owner {
		job.err = s.generateSegment(session, index)
		session.finishSegmentJob(index, job)
	}

	<-job.done
	return job.err
}

func (s *Service) generateSegment(session *Session, index int) error {
	start := float64(index) * session.SegmentSeconds
	duration := math.Min(session.SegmentSeconds, session.DurationSeconds-start)
	if duration <= 0 {
		return os.ErrNotExist
	}
	return s.segmentGenerator(session.ctx, session.FFmpegPath, session.SourcePath, session.segmentPath(index), session.Item, session.Profile, start, duration)
}

func (s *Service) prefetchSegments(sessionID string, startIndex int, count int) {
	for offset := 0; offset < count; offset++ {
		session := s.getSession(sessionID)
		if session == nil {
			return
		}
		index := startIndex + offset
		if index >= session.SegmentCount {
			return
		}
		if err := s.ensureSegment(session, index); err != nil {
			return
		}
	}
}

func (session *Session) beginSegmentJob(index int) (*segmentJob, bool) {
	session.mu.Lock()
	defer session.mu.Unlock()

	if session.jobs == nil {
		session.jobs = map[int]*segmentJob{}
	}
	if existing := session.jobs[index]; existing != nil {
		return existing, false
	}
	job := &segmentJob{done: make(chan struct{})}
	session.jobs[index] = job
	return job, true
}

func (session *Session) finishSegmentJob(index int, job *segmentJob) {
	session.mu.Lock()
	delete(session.jobs, index)
	session.mu.Unlock()
	close(job.done)
}

func (session *Session) activeJobs() []*segmentJob {
	session.mu.Lock()
	defer session.mu.Unlock()

	jobs := make([]*segmentJob, 0, len(session.jobs))
	for _, job := range session.jobs {
		jobs = append(jobs, job)
	}
	return jobs
}

func (session *Session) segmentPath(index int) string {
	return filepath.Join(session.Dir, segmentFilename(index))
}

func waitForJobs(session *Session, timeout time.Duration) {
	deadline := time.NewTimer(timeout)
	defer deadline.Stop()

	for {
		jobs := session.activeJobs()
		if len(jobs) == 0 {
			return
		}
		for _, job := range jobs {
			select {
			case <-job.done:
			case <-deadline.C:
				return
			}
		}
	}
}

func serveSessionManifest(w http.ResponseWriter, r *http.Request, session *Session) error {
	manifest := []byte(sessionManifest(session))
	w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Length", strconv.Itoa(len(manifest)))
	if r.Method == http.MethodHead {
		return nil
	}
	_, err := w.Write(manifest)
	return err
}

func sessionManifest(session *Session) string {
	var b strings.Builder
	targetDuration := int(math.Ceil(session.SegmentSeconds))

	b.WriteString("#EXTM3U\n")
	b.WriteString("#EXT-X-VERSION:3\n")
	b.WriteString(fmt.Sprintf("#EXT-X-TARGETDURATION:%d\n", targetDuration))
	b.WriteString("#EXT-X-MEDIA-SEQUENCE:0\n")
	b.WriteString("#EXT-X-PLAYLIST-TYPE:VOD\n")
	b.WriteString("#EXT-X-INDEPENDENT-SEGMENTS\n")
	for index := 0; index < session.SegmentCount; index++ {
		duration := math.Min(session.SegmentSeconds, session.DurationSeconds-float64(index)*session.SegmentSeconds)
		if duration <= 0 {
			continue
		}
		if index > 0 {
			b.WriteString("#EXT-X-DISCONTINUITY\n")
		}
		b.WriteString(fmt.Sprintf("#EXTINF:%.3f,\n", duration))
		b.WriteString(segmentFilename(index))
		b.WriteByte('\n')
	}
	b.WriteString("#EXT-X-ENDLIST\n")
	return b.String()
}

func runFFmpegSegment(ctx context.Context, ffmpegPath string, sourcePath string, outPath string, item library.MediaItem, profile smoothProfile, startSeconds float64, durationSeconds float64) error {
	if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
		return err
	}

	partial := outPath + ".partial"
	_ = os.Remove(partial)

	args := hlsSegmentArgs(sourcePath, partial, profile, startSeconds, durationSeconds)
	output, err := exec.CommandContext(ctx, ffmpegPath, args...).CombinedOutput()
	if err != nil {
		_ = os.Remove(partial)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return fmt.Errorf("stream segment generation failed: %v: %s", err, strings.TrimSpace(string(output)))
	}
	if !fileReady(partial) {
		_ = os.Remove(partial)
		return fmt.Errorf("stream segment generation produced an empty segment")
	}

	_ = os.Remove(outPath)
	if err := os.Rename(partial, outPath); err != nil {
		_ = os.Remove(partial)
		return err
	}
	return nil
}

func hlsSegmentArgs(sourcePath string, outPath string, profile smoothProfile, startSeconds float64, durationSeconds float64) []string {
	args := []string{
		"-hide_banner",
		"-loglevel", "error",
		"-y",
		"-ss", formatSeconds(startSeconds),
		"-fflags", "+genpts",
		"-i", sourcePath,
		"-t", formatSeconds(durationSeconds),
		"-map", "0:v:0",
		"-map", "0:a:0?",
		"-dn",
		"-sn",
	}

	if profile.Quality == QualityOriginal {
		args = append(args,
			"-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
			"-c:v", "libx264",
			"-preset", "veryfast",
			"-crf", profile.CRF,
		)
	} else {
		args = append(args,
			"-vf", fmt.Sprintf("scale=-2:%d", profile.Height),
			"-c:v", "libx264",
			"-preset", "veryfast",
			"-b:v", profile.Bitrate,
			"-maxrate", profile.Bitrate,
			"-bufsize", profile.Bufsize,
		)
	}

	args = append(args,
		"-pix_fmt", "yuv420p",
		"-c:a", "aac",
		"-b:a", "128k",
		"-ac", "2",
		"-avoid_negative_ts", "make_zero",
		"-muxdelay", "0",
		"-f", "mpegts",
		outPath,
	)
	return args
}

func smoothProfileFor(quality string, sourceHeight int) smoothProfile {
	switch normalizeQuality(quality) {
	case QualityOriginal:
		return smoothProfile{Quality: QualityOriginal, Height: originalEvenHeight(sourceHeight), CRF: "18"}
	case Quality360p:
		return smoothProfile{Quality: Quality360p, Height: cappedEvenHeight(360, sourceHeight), Bitrate: "800k", Bufsize: "1600k"}
	case Quality480p:
		return smoothProfile{Quality: Quality480p, Height: cappedEvenHeight(480, sourceHeight), Bitrate: "1400k", Bufsize: "2800k"}
	default:
		return smoothProfile{Quality: Quality720p, Height: cappedEvenHeight(720, sourceHeight), Bitrate: "2500k", Bufsize: "5000k"}
	}
}

func originalEvenHeight(sourceHeight int) int {
	if sourceHeight <= 0 {
		return 0
	}
	if sourceHeight%2 != 0 {
		sourceHeight--
	}
	if sourceHeight < 2 {
		return 0
	}
	return sourceHeight
}

func cappedEvenHeight(target int, sourceHeight int) int {
	height := target
	if sourceHeight > 0 && sourceHeight < height {
		height = sourceHeight
	}
	if height < 360 && sourceHeight <= 0 {
		height = 360
	}
	if height%2 != 0 {
		height--
	}
	if height < 2 {
		height = 2
	}
	return height
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

func serveFile(w http.ResponseWriter, r *http.Request, path string, contentType string, cacheControl string) error {
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
	if cacheControl != "" {
		w.Header().Set("Cache-Control", cacheControl)
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")

	http.ServeContent(w, r, filepath.Base(path), info.ModTime(), file)
	return nil
}

func fileReady(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Size() > 0
}

func newSessionID() (string, error) {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw[:]), nil
}

func sessionRoot() string {
	return filepath.Join(os.TempDir(), "mediavault-playback-sessions")
}

func segmentCount(durationSeconds float64, segmentSeconds float64) int {
	if durationSeconds <= 0 || segmentSeconds <= 0 {
		return 1
	}
	return int(math.Max(1, math.Ceil(durationSeconds/segmentSeconds)))
}

func segmentFilename(index int) string {
	return fmt.Sprintf("segment_%05d.ts", index)
}

func segmentIndex(path string) (int, bool) {
	base := filepath.Base(path)
	if !strings.HasPrefix(base, "segment_") || !strings.HasSuffix(base, ".ts") {
		return 0, false
	}
	raw := strings.TrimSuffix(strings.TrimPrefix(base, "segment_"), ".ts")
	if len(raw) != 5 {
		return 0, false
	}
	index, err := strconv.Atoi(raw)
	return index, err == nil
}

func normalizeQuality(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case QualityOriginal:
		return QualityOriginal
	case Quality360p:
		return Quality360p
	case Quality480p:
		return Quality480p
	case Quality720p:
		return Quality720p
	default:
		return QualityAuto
	}
}

func clampStart(value float64, duration float64) float64 {
	if value < 0 {
		return 0
	}
	if duration > 0 && value > duration-2 {
		return math.Max(duration-2, 0)
	}
	return value
}

func formatSeconds(value float64) string {
	return strconv.FormatFloat(value, 'f', 3, 64)
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

var ErrSessionNotFound = errors.New("playback session not found")
