package playback

import (
	"slices"
	"testing"

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
			item:       mediaItem("h264", "aac", ".mp4"),
			wantDirect: true,
		},
		{
			name:       "mp4 with ac3 audio needs compatible stream",
			path:       `C:\media\movie.mp4`,
			item:       mediaItem("h264", "ac3", ".mp4"),
			wantDirect: false,
		},
		{
			name:       "transport stream needs compatible stream",
			path:       `C:\media\movie.ts`,
			item:       mediaItem("h264", "aac", ".ts"),
			wantDirect: false,
		},
		{
			name:       "mkv container needs compatible stream",
			path:       `C:\media\movie.mkv`,
			item:       mediaItem("h264", "aac", ".mkv"),
			wantDirect: false,
		},
		{
			name:       "webm with vp9 and opus can stream directly",
			path:       `C:\media\clip.webm`,
			item:       mediaItem("vp9", "opus", ".webm"),
			wantDirect: true,
		},
		{
			name:       "unknown codecs use compatible stream",
			path:       `C:\media\movie.mp4`,
			item:       mediaItem("", "", ".mp4"),
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

func TestCompatibleMP4Args(t *testing.T) {
	args := compatibleMP4Args(`C:\media\movie.ts`)

	for _, want := range []string{"libx264", "aac", "frag_keyframe+empty_moov+default_base_moof", "pipe:1"} {
		if !slices.Contains(args, want) {
			t.Fatalf("compatibleMP4Args() missing %q in %#v", want, args)
		}
	}
}

func mediaItem(videoCodec string, audioCodec string, extension string) *library.MediaItem {
	return &library.MediaItem{
		VideoCodec: videoCodec,
		AudioCodec: audioCodec,
		Extension:  extension,
	}
}
