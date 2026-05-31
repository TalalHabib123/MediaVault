package playback

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"sync/atomic"
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
			name:       "mp4 with ac3 audio needs compatible stream",
			path:       `C:\media\movie.mp4`,
			item:       mediaItem(1, "h264", "ac3", ".mp4"),
			wantDirect: false,
		},
		{
			name:       "transport stream needs compatible stream",
			path:       `C:\media\movie.ts`,
			item:       mediaItem(1, "h264", "aac", ".ts"),
			wantDirect: false,
		},
		{
			name:       "mkv container needs compatible stream",
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
			name:       "unknown codecs use compatible stream",
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

func TestMP4ArgsUseSeekableFiles(t *testing.T) {
	remuxArgs := remuxMP4Args(`C:\media\movie.mkv`, `C:\cache\movie.mp4.partial`)
	for _, want := range []string{"copy", "+faststart", `C:\cache\movie.mp4.partial`} {
		if !slices.Contains(remuxArgs, want) {
			t.Fatalf("remuxMP4Args() missing %q in %#v", want, remuxArgs)
		}
	}
	if slices.Contains(remuxArgs, "pipe:1") {
		t.Fatalf("remuxMP4Args() should not pipe output: %#v", remuxArgs)
	}

	transcodeArgs := transcodeMP4Args(`C:\media\movie.ts`, `C:\cache\movie.mp4.partial`)
	for _, want := range []string{"libx264", "aac", "+faststart", `C:\cache\movie.mp4.partial`} {
		if !slices.Contains(transcodeArgs, want) {
			t.Fatalf("transcodeMP4Args() missing %q in %#v", want, transcodeArgs)
		}
	}
	if slices.Contains(transcodeArgs, "pipe:1") {
		t.Fatalf("transcodeMP4Args() should not pipe output: %#v", transcodeArgs)
	}
}

func TestResolveModeKeepsLocalDirectAndUsesRemoteHLS(t *testing.T) {
	service := NewService(config.NewService(t.TempDir()))
	item := mediaItem(10, "h264", "aac", ".mp4")

	if got := service.resolveMode(item, `C:\media\movie.mp4`, ModeAuto, false); got != ModeDirect {
		t.Fatalf("local mode = %q, want %q", got, ModeDirect)
	}
	if got := service.resolveMode(item, `C:\media\movie.mp4`, ModeAuto, true); got != ModeHLS {
		t.Fatalf("remote mode = %q, want %q", got, ModeHLS)
	}
}

func TestServeDirectSupportsRangeRequests(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "clip.mp4")
	if err := os.WriteFile(path, []byte("0123456789"), 0o644); err != nil {
		t.Fatalf("write media: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/clip.mp4", nil)
	req.Header.Set("Range", "bytes=2-5")
	rec := httptest.NewRecorder()

	if err := serveDirect(rec, req, path); err != nil {
		t.Fatalf("serve direct: %v", err)
	}
	if rec.Code != http.StatusPartialContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusPartialContent)
	}
	if got := rec.Header().Get("Content-Range"); got != "bytes 2-5/10" {
		t.Fatalf("Content-Range = %q", got)
	}
	if got := rec.Header().Get("Accept-Ranges"); got != "bytes" {
		t.Fatalf("Accept-Ranges = %q", got)
	}
	if got := rec.Body.String(); got != "2345" {
		t.Fatalf("body = %q", got)
	}
}

func TestServeCachedMP4SupportsRangeRequests(t *testing.T) {
	root := t.TempDir()
	service := NewService(config.NewService(root))
	sourcePath := filepath.Join(root, "media", "movie.mkv")
	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("mkdir media: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte("source"), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}

	item := mediaItem(77, "h264", "ac3", ".mkv")
	target, err := service.targetFor(item, ModeMP4)
	if err != nil {
		t.Fatalf("target: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(target.OutputPath), 0o755); err != nil {
		t.Fatalf("mkdir cache: %v", err)
	}
	if err := os.WriteFile(target.OutputPath, []byte("abcdefghij"), 0o644); err != nil {
		t.Fatalf("write cache: %v", err)
	}

	oldTime := time.Now().Add(-2 * time.Hour)
	newTime := time.Now().Add(-1 * time.Hour)
	if err := os.Chtimes(sourcePath, oldTime, oldTime); err != nil {
		t.Fatalf("chtimes source: %v", err)
	}
	if err := os.Chtimes(target.OutputPath, newTime, newTime); err != nil {
		t.Fatalf("chtimes cache: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/library/77/stream", nil)
	req.Header.Set("Range", "bytes=1-3")
	rec := httptest.NewRecorder()

	if err := service.Serve(rec, req, item, sourcePath); err != nil {
		t.Fatalf("serve cached mp4: %v", err)
	}
	if rec.Code != http.StatusPartialContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusPartialContent)
	}
	if got := rec.Header().Get("Content-Range"); got != "bytes 1-3/10" {
		t.Fatalf("Content-Range = %q", got)
	}
	if got := rec.Header().Get("Accept-Ranges"); got != "bytes" {
		t.Fatalf("Accept-Ranges = %q", got)
	}
}

func TestIsFreshDetectsStaleCache(t *testing.T) {
	root := t.TempDir()
	sourcePath := filepath.Join(root, "source.mkv")
	targetPath := filepath.Join(root, "target.mp4")
	if err := os.WriteFile(sourcePath, []byte("source"), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	if err := os.WriteFile(targetPath, []byte("target"), 0o644); err != nil {
		t.Fatalf("write target: %v", err)
	}

	sourceTime := time.Now()
	staleTime := sourceTime.Add(-time.Hour)
	if err := os.Chtimes(sourcePath, sourceTime, sourceTime); err != nil {
		t.Fatalf("chtimes source: %v", err)
	}
	if err := os.Chtimes(targetPath, staleTime, staleTime); err != nil {
		t.Fatalf("chtimes stale target: %v", err)
	}

	fresh, err := isFresh(sourcePath, targetPath)
	if err != nil {
		t.Fatalf("isFresh stale: %v", err)
	}
	if fresh {
		t.Fatalf("expected stale target")
	}

	freshTime := sourceTime.Add(time.Hour)
	if err := os.Chtimes(targetPath, freshTime, freshTime); err != nil {
		t.Fatalf("chtimes fresh target: %v", err)
	}
	fresh, err = isFresh(sourcePath, targetPath)
	if err != nil {
		t.Fatalf("isFresh fresh: %v", err)
	}
	if !fresh {
		t.Fatalf("expected fresh target")
	}
}

func TestPreparationJobsAreDeduplicated(t *testing.T) {
	root := t.TempDir()
	service := NewService(config.NewService(root))
	sourcePath := filepath.Join(root, "media", "movie.mkv")
	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("mkdir media: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte("source"), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}

	item := mediaItem(88, "h264", "ac3", ".mkv")
	started := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int32
	service.generator = func(ctx context.Context, item *library.MediaItem, sourcePath string, target playbackTarget) error {
		if calls.Add(1) == 1 {
			close(started)
		}
		<-release
		return nil
	}

	if _, err := service.Status(item, sourcePath, ModeMP4, false, true); err != nil {
		t.Fatalf("first status: %v", err)
	}
	if _, err := service.Status(item, sourcePath, ModeMP4, false, true); err != nil {
		t.Fatalf("second status: %v", err)
	}

	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatalf("generation did not start")
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("generator calls = %d, want 1", got)
	}
	close(release)
}

func TestHLSVariantsAreCappedBySourceHeight(t *testing.T) {
	variants := hlsVariantsFor(480)
	if len(variants) != 2 {
		t.Fatalf("variant count = %d, want 2", len(variants))
	}
	if variants[0].Name != "480p" || variants[1].Name != "360p" {
		t.Fatalf("variants = %#v", variants)
	}
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
