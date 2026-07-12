package playback

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"mediavault/internal/config"
	"mediavault/internal/library"
)

func TestCanServeDirectlyToBrowser(t *testing.T) {
	tests := []struct {
		name       string
		path       string
		item       *library.MediaItem
		wantDirect bool
	}{
		{
			name:       "mp4 with h264 and aac can stream directly",
			path:       `C:\media\movie.mp4`,
			item:       mediaItem(1, "h264", "aac", ".mp4"),
			wantDirect: true,
		},
		{
			name:       "mp4 with ac3 audio is not browser-native",
			path:       `C:\media\movie.mp4`,
			item:       mediaItem(1, "h264", "ac3", ".mp4"),
			wantDirect: false,
		},
		{
			name:       "mkv container is not browser-native",
			path:       `C:\media\movie.mkv`,
			item:       mediaItem(1, "h264", "aac", ".mkv"),
			wantDirect: false,
		},
		{
			name:       "webm with vp9 and opus can stream directly",
			path:       `C:\media\clip.webm`,
			item:       mediaItem(1, "vp9", "opus", ".webm"),
			wantDirect: true,
		},
		{
			name:       "unknown codecs are not browser-native",
			path:       `C:\media\movie.mp4`,
			item:       mediaItem(1, "", "", ".mp4"),
			wantDirect: false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := CanServeDirectlyToBrowser(test.item, test.path)
			if got != test.wantDirect {
				t.Fatalf("CanServeDirectlyToBrowser() = %v, want %v", got, test.wantDirect)
			}
		})
	}
}

func TestPlanReturnsImmediatelyWithoutGeneratingSegments(t *testing.T) {
	root := t.TempDir()
	service := NewService(config.NewService(root))
	service.segmentGenerator = func(ctx context.Context, ffmpegPath string, sourcePath string, outPath string, item library.MediaItem, profile smoothProfile, startSeconds float64, durationSeconds float64) error {
		t.Fatalf("Plan should not generate segments")
		return nil
	}

	sourcePath := writeFile(t, root, "media/movie.mkv", "source")
	plan, err := service.Plan(mediaItem(12, "h264", "aac", ".mkv"), sourcePath, true)
	if err != nil {
		t.Fatalf("plan: %v", err)
	}
	if plan.Mode != ModeSmoothHLS {
		t.Fatalf("mode = %q, want %q", plan.Mode, ModeSmoothHLS)
	}
	if !plan.Seekable {
		t.Fatalf("expected smooth plan to expose a seekable VOD manifest")
	}
	if plan.SessionURL != "/api/library/12/playback/session" {
		t.Fatalf("session_url = %q", plan.SessionURL)
	}
}

func TestBrowserNativePlanUsesDirectEvenForRemoteRequests(t *testing.T) {
	root := t.TempDir()
	service := NewService(config.NewService(root))
	sourcePath := writeFile(t, root, "media/movie.mp4", "source")

	plan, err := service.Plan(mediaItem(15, "h264", "aac", ".mp4"), sourcePath, true)
	if err != nil {
		t.Fatalf("plan: %v", err)
	}
	if plan.Mode != ModeDirect {
		t.Fatalf("mode = %q, want %q", plan.Mode, ModeDirect)
	}
	if plan.StreamURL != "/api/library/15/stream" {
		t.Fatalf("stream_url = %q", plan.StreamURL)
	}
	if !plan.Seekable {
		t.Fatalf("direct plan should be seekable")
	}
}

func TestServeOriginalSupportsHeadAndRangeRequests(t *testing.T) {
	root := t.TempDir()
	path := writeFile(t, root, "media/clip.mp4", "0123456789")
	service := NewService(config.NewService(root))

	headReq := httptest.NewRequest(http.MethodHead, "/clip.mp4", nil)
	headRec := httptest.NewRecorder()
	if err := service.Serve(headRec, headReq, mediaItem(1, "h264", "aac", ".mp4"), path); err != nil {
		t.Fatalf("serve head: %v", err)
	}
	if headRec.Code != http.StatusOK {
		t.Fatalf("HEAD status = %d, want %d", headRec.Code, http.StatusOK)
	}
	if got := headRec.Header().Get("Accept-Ranges"); got != "bytes" {
		t.Fatalf("HEAD Accept-Ranges = %q", got)
	}
	if got := headRec.Header().Get("Accept-Ranges"); got == "none" {
		t.Fatalf("HEAD should not disable ranges")
	}

	rangeReq := httptest.NewRequest(http.MethodGet, "/clip.mp4", nil)
	rangeReq.Header.Set("Range", "bytes=2-5")
	rangeRec := httptest.NewRecorder()
	if err := service.Serve(rangeRec, rangeReq, mediaItem(1, "h264", "aac", ".mp4"), path); err != nil {
		t.Fatalf("serve range: %v", err)
	}
	if rangeRec.Code != http.StatusPartialContent {
		t.Fatalf("range status = %d, want %d", rangeRec.Code, http.StatusPartialContent)
	}
	if got := rangeRec.Header().Get("Content-Range"); got != "bytes 2-5/10" {
		t.Fatalf("Content-Range = %q", got)
	}
	if got := rangeRec.Body.String(); got != "2345" {
		t.Fatalf("body = %q", got)
	}
}

func TestHLSSegmentArgsUseRequestedWindowAndQuality(t *testing.T) {
	args := hlsSegmentArgs(
		`C:\media\movie.mkv`,
		`C:\Temp\session\segment_00008.ts.partial`,
		smoothProfileFor(Quality480p, 720),
		64,
		8,
	)

	for _, want := range []string{"-ss", "64.000", "-t", "8.000", "scale=-2:480", "1400k", "-f", "mpegts"} {
		if !slices.Contains(args, want) {
			t.Fatalf("hlsSegmentArgs() missing %q in %#v", want, args)
		}
	}
	if slices.Contains(args, "-re") {
		t.Fatalf("on-demand segment generation should not be realtime-throttled: %#v", args)
	}
}

func TestHLSSegmentArgsPreserveSourceResolutionForOriginalQuality(t *testing.T) {
	profile := smoothProfileFor(QualityOriginal, 1080)
	if profile.Quality != QualityOriginal {
		t.Fatalf("quality = %q, want %q", profile.Quality, QualityOriginal)
	}
	if profile.Height != 1080 {
		t.Fatalf("height = %d, want 1080", profile.Height)
	}

	args := hlsSegmentArgs(
		`C:\media\movie.mkv`,
		`C:\Temp\session\segment_00001.ts.partial`,
		profile,
		8,
		8,
	)

	for _, want := range []string{"scale=trunc(iw/2)*2:trunc(ih/2)*2", "-crf", "18", "-f", "mpegts"} {
		if !slices.Contains(args, want) {
			t.Fatalf("hlsSegmentArgs() missing %q in %#v", want, args)
		}
	}
	for _, notWant := range []string{"scale=-2:720", "-b:v", "-maxrate", "-bufsize"} {
		if slices.Contains(args, notWant) {
			t.Fatalf("hlsSegmentArgs() should not include %q for original quality: %#v", notWant, args)
		}
	}
}

func TestStartSessionAcceptsOriginalQuality(t *testing.T) {
	root := t.TempDir()
	cfg := config.NewService(root)
	sourcePath := writeFile(t, root, "media/movie.mkv", "source")
	_ = writeFile(t, root, "bin/ffmpeg.exe", "ffmpeg")

	service := NewService(cfg)
	session, err := service.StartSession(mediaItem(55, "h264", "aac", ".mkv"), sourcePath, SessionInput{Quality: QualityOriginal})
	if err != nil {
		t.Fatalf("start session: %v", err)
	}
	defer func() { _ = service.StopSession(session.SessionID) }()

	if session.Quality != QualityOriginal {
		t.Fatalf("quality = %q, want %q", session.Quality, QualityOriginal)
	}
	sessionState := service.getSession(session.SessionID)
	if sessionState == nil {
		t.Fatalf("expected session state")
	}
	if sessionState.Profile.Quality != QualityOriginal {
		t.Fatalf("profile quality = %q, want %q", sessionState.Profile.Quality, QualityOriginal)
	}
}

func TestStartSessionReturnsFullVODManifestWithoutGeneratingSegments(t *testing.T) {
	root := t.TempDir()
	cfg := config.NewService(root)
	ffmpegPath := writeFile(t, root, "bin/ffmpeg.exe", "ffmpeg")
	sourcePath := writeFile(t, root, "media/movie.mkv", "source")

	service := NewService(cfg)
	service.segmentGenerator = func(ctx context.Context, gotFFmpegPath string, gotSourcePath string, outPath string, item library.MediaItem, profile smoothProfile, startSeconds float64, durationSeconds float64) error {
		t.Fatalf("manifest should not generate segments")
		return nil
	}

	session, err := service.StartSession(mediaItem(55, "h264", "aac", ".mkv"), sourcePath, SessionInput{StartSeconds: 60, Quality: Quality360p})
	if err != nil {
		t.Fatalf("start session: %v", err)
	}
	defer func() { _ = service.StopSession(session.SessionID) }()

	if session.SessionID == "" {
		t.Fatalf("expected session id")
	}
	if session.ManifestURL != "/api/playback/sessions/"+session.SessionID+"/index.m3u8" {
		t.Fatalf("manifest url = %q", session.ManifestURL)
	}
	if session.Quality != Quality360p {
		t.Fatalf("quality = %q, want %q", session.Quality, Quality360p)
	}
	if session.StartSeconds != 60 {
		t.Fatalf("start_seconds = %v, want 60", session.StartSeconds)
	}
	if _, err := os.Stat(ffmpegPath); err != nil {
		t.Fatalf("expected fake ffmpeg to exist: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, session.ManifestURL, nil)
	rec := httptest.NewRecorder()
	if err := service.ServeSessionAsset(rec, req, session.SessionID, "index.m3u8"); err != nil {
		t.Fatalf("serve manifest: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("manifest status = %d, want %d", rec.Code, http.StatusOK)
	}
	manifest := rec.Body.String()
	for _, want := range []string{"#EXT-X-PLAYLIST-TYPE:VOD", "#EXT-X-ENDLIST", "segment_00000.ts", "segment_00014.ts"} {
		if !strings.Contains(manifest, want) {
			t.Fatalf("manifest missing %q:\n%s", want, manifest)
		}
	}
}

func TestSegmentRequestGeneratesTemporarySegmentAndStopRemovesIt(t *testing.T) {
	root := t.TempDir()
	cfg := config.NewService(root)
	sourcePath := writeFile(t, root, "media/movie.mkv", "source")
	_ = writeFile(t, root, "bin/ffmpeg.exe", "ffmpeg")

	service := NewService(cfg)
	var mu sync.Mutex
	var starts []float64
	service.segmentGenerator = func(ctx context.Context, gotFFmpegPath string, gotSourcePath string, outPath string, item library.MediaItem, profile smoothProfile, startSeconds float64, durationSeconds float64) error {
		mu.Lock()
		starts = append(starts, startSeconds)
		mu.Unlock()
		return os.WriteFile(outPath, []byte("segment"), 0o644)
	}

	session, err := service.StartSession(mediaItem(55, "h264", "aac", ".mkv"), sourcePath, SessionInput{Quality: Quality480p})
	if err != nil {
		t.Fatalf("start session: %v", err)
	}
	sessionState := service.getSession(session.SessionID)
	if sessionState == nil {
		t.Fatalf("expected session state")
	}

	req := httptest.NewRequest(http.MethodGet, "/api/playback/sessions/"+session.SessionID+"/segment_00003.ts", nil)
	rec := httptest.NewRecorder()
	if err := service.ServeSessionAsset(rec, req, session.SessionID, "segment_00003.ts"); err != nil {
		t.Fatalf("serve segment: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("segment status = %d, want %d", rec.Code, http.StatusOK)
	}
	if got := rec.Body.String(); got != "segment" {
		t.Fatalf("segment body = %q", got)
	}
	if !fileReady(filepath.Join(sessionState.Dir, "segment_00003.ts")) {
		t.Fatalf("expected generated segment file")
	}

	mu.Lock()
	if len(starts) == 0 || starts[0] != 24 {
		t.Fatalf("generated starts = %#v, want first start 24", starts)
	}
	mu.Unlock()

	sessionDir := sessionState.Dir
	if err := service.StopSession(session.SessionID); err != nil {
		t.Fatalf("stop session: %v", err)
	}
	if _, err := os.Stat(sessionDir); !os.IsNotExist(err) {
		t.Fatalf("expected session dir removed, err=%v", err)
	}
}

func TestStopSessionCancelsActiveSegmentGeneration(t *testing.T) {
	root := t.TempDir()
	cfg := config.NewService(root)
	sourcePath := writeFile(t, root, "media/movie.mkv", "source")
	_ = writeFile(t, root, "bin/ffmpeg.exe", "ffmpeg")

	service := NewService(cfg)
	started := make(chan struct{})
	service.segmentGenerator = func(ctx context.Context, gotFFmpegPath string, gotSourcePath string, outPath string, item library.MediaItem, profile smoothProfile, startSeconds float64, durationSeconds float64) error {
		close(started)
		<-ctx.Done()
		return ctx.Err()
	}

	session, err := service.StartSession(mediaItem(88, "h264", "aac", ".mkv"), sourcePath, SessionInput{})
	if err != nil {
		t.Fatalf("start session: %v", err)
	}
	sessionState := service.getSession(session.SessionID)
	if sessionState == nil {
		t.Fatalf("expected session state")
	}

	done := make(chan error, 1)
	go func() {
		req := httptest.NewRequest(http.MethodGet, "/api/playback/sessions/"+session.SessionID+"/segment_00000.ts", nil)
		rec := httptest.NewRecorder()
		done <- service.ServeSessionAsset(rec, req, session.SessionID, "segment_00000.ts")
	}()

	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatalf("segment generation did not start")
	}

	if err := service.StopSession(session.SessionID); err != nil {
		t.Fatalf("stop session: %v", err)
	}
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatalf("segment request did not unblock")
	}
	if _, err := os.Stat(sessionState.Dir); !os.IsNotExist(err) {
		t.Fatalf("expected session dir removed, err=%v", err)
	}
}

func TestCleanupLegacyPlaybackCacheOnlyRemovesPlaybackDirectory(t *testing.T) {
	root := t.TempDir()
	cfg := config.NewService(root)
	mediaPath := writeFile(t, root, "media/original.mp4", "source")

	loaded, err := cfg.Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	cacheRoot := cfg.ResolvePath(loaded.Paths.PreviewCache)
	legacyPath := writeFile(t, cacheRoot, "playback/mp4/1.mp4", "cache")

	service := NewService(cfg)
	if !service.CleanupLegacyPlaybackCache() {
		t.Fatalf("expected cleanup success")
	}
	if _, err := os.Stat(legacyPath); !os.IsNotExist(err) {
		t.Fatalf("expected legacy cache removed, err=%v", err)
	}
	if _, err := os.Stat(mediaPath); err != nil {
		t.Fatalf("expected original media to remain, err=%v", err)
	}
}

func writeFile(t *testing.T, root string, relPath string, content string) string {
	t.Helper()

	path := filepath.Join(root, filepath.FromSlash(relPath))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", path, err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
	return path
}

func mediaItem(id int64, videoCodec string, audioCodec string, extension string) *library.MediaItem {
	return &library.MediaItem{
		ID:              id,
		DurationSeconds: 120,
		Height:          720,
		VideoCodec:      videoCodec,
		AudioCodec:      audioCodec,
		Extension:       extension,
	}
}
