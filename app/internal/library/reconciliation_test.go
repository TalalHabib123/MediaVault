package library

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	appdb "mediavault/internal/db"
	"mediavault/internal/metadata"
)

func TestReconcileMarksMissingAndRestoresPreservingTags(t *testing.T) {
	repo, metadataRepo := newTestRepositories(t)
	service := NewReconcileService(repo)

	mediaPath := writeTestMedia(t, filepath.Join(t.TempDir(), "media", "reference.mp4"))
	mediaID := createTestMedia(t, repo, mediaPath, "Reference")

	tag, err := metadataRepo.CreateTag(metadata.CreateTagInput{Name: "Favorite"})
	if err != nil {
		t.Fatalf("create tag: %v", err)
	}
	if err := metadataRepo.ReplaceAssignments(mediaID, metadata.UpdateAssignmentsInput{
		TagIDs: []int64{tag.ID},
	}); err != nil {
		t.Fatalf("replace assignments: %v", err)
	}

	if err := os.Remove(mediaPath); err != nil {
		t.Fatalf("remove media file: %v", err)
	}

	summary, err := service.Reconcile(context.Background())
	if err != nil {
		t.Fatalf("reconcile missing: %v", err)
	}
	if summary.Checked != 1 || summary.MarkedMissing != 1 || summary.Restored != 0 {
		t.Fatalf("unexpected missing summary: %+v", summary)
	}

	items, total, err := repo.List("", "all", "all", 10, 0)
	if err != nil {
		t.Fatalf("list visible media: %v", err)
	}
	if total != 0 || len(items) != 0 {
		t.Fatalf("expected missing media hidden, got total=%d len=%d", total, len(items))
	}

	searchItems, searchTotal, err := repo.SearchTagged(SearchTaggedParams{Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("search tagged: %v", err)
	}
	if searchTotal != 0 || len(searchItems) != 0 {
		t.Fatalf("expected missing tagged media hidden, got total=%d len=%d", searchTotal, len(searchItems))
	}

	assignments, err := metadataRepo.GetAssignments(mediaID)
	if err != nil {
		t.Fatalf("get assignments: %v", err)
	}
	if len(assignments.TagIDs) != 1 || assignments.TagIDs[0] != tag.ID {
		t.Fatalf("expected tags to remain assigned, got %+v", assignments.TagIDs)
	}

	writeTestMedia(t, mediaPath)
	summary, err = service.Reconcile(context.Background())
	if err != nil {
		t.Fatalf("reconcile restored: %v", err)
	}
	if summary.Checked != 1 || summary.MarkedMissing != 0 || summary.Restored != 1 {
		t.Fatalf("unexpected restored summary: %+v", summary)
	}

	items, total, err = repo.List("", "all", "all", 10, 0)
	if err != nil {
		t.Fatalf("list restored media: %v", err)
	}
	if total != 1 || len(items) != 1 || items[0].ID != mediaID {
		t.Fatalf("expected restored media visible, got total=%d items=%+v", total, items)
	}
}

func TestUpsertClearsMissingAtAndPreservesManualTitle(t *testing.T) {
	repo, _ := newTestRepositories(t)

	mediaPath := writeTestMedia(t, filepath.Join(t.TempDir(), "media", "manual.mp4"))
	mediaID := createTestMedia(t, repo, mediaPath, "Automatic Title")

	if err := repo.UpdateEditable(mediaID, UpdateEditableInput{
		Title:     "Manual Title",
		MediaType: "movie",
	}); err != nil {
		t.Fatalf("update editable: %v", err)
	}
	if err := repo.MarkMissing(mediaID, time.Now().UTC().Format(time.RFC3339)); err != nil {
		t.Fatalf("mark missing: %v", err)
	}

	_, status, err := repo.Upsert(&MediaItem{
		Title:           "New Probe Title",
		MediaType:       "video",
		SourcePath:      mediaPath,
		FileName:        filepath.Base(mediaPath),
		Extension:       ".mp4",
		DurationSeconds: 2,
		TypeSource:      "auto",
		TitleSource:     "auto",
		SequenceSource:  "auto",
	})
	if err != nil {
		t.Fatalf("upsert restored media: %v", err)
	}
	if status != "updated" {
		t.Fatalf("expected updated status, got %q", status)
	}

	item, err := repo.GetByID(mediaID)
	if err != nil {
		t.Fatalf("get restored media: %v", err)
	}
	if item.MissingAt != "" {
		t.Fatalf("expected missing_at cleared, got %q", item.MissingAt)
	}
	if item.Title != "Manual Title" || item.MediaType != "movie" {
		t.Fatalf("expected manual metadata preserved, got title=%q type=%q", item.Title, item.MediaType)
	}
}

func TestEpisodeNavigationExcludesMissingItems(t *testing.T) {
	repo, metadataRepo := newTestRepositories(t)

	dir := t.TempDir()
	firstPath := writeTestMedia(t, filepath.Join(dir, "series", "show.s01e01.mp4"))
	secondPath := writeTestMedia(t, filepath.Join(dir, "series", "show.s01e02.mp4"))
	firstID := createTestEpisode(t, repo, firstPath, "Episode 1", 1)
	secondID := createTestEpisode(t, repo, secondPath, "Episode 2", 2)

	series, err := metadataRepo.CreateSeries(metadata.CreateSeriesInput{Name: "Show"})
	if err != nil {
		t.Fatalf("create series: %v", err)
	}
	for _, id := range []int64{firstID, secondID} {
		if err := metadataRepo.ReplaceAssignments(id, metadata.UpdateAssignmentsInput{
			SeriesID: &series.ID,
		}); err != nil {
			t.Fatalf("replace series assignment: %v", err)
		}
	}

	_, nextID, err := repo.GetEpisodeNavigation(firstID)
	if err != nil {
		t.Fatalf("get navigation before missing: %v", err)
	}
	if nextID == nil || *nextID != secondID {
		t.Fatalf("expected second episode as next, got %v", nextID)
	}

	if err := repo.MarkMissing(secondID, time.Now().UTC().Format(time.RFC3339)); err != nil {
		t.Fatalf("mark second missing: %v", err)
	}

	_, nextID, err = repo.GetEpisodeNavigation(firstID)
	if err != nil {
		t.Fatalf("get navigation after missing: %v", err)
	}
	if nextID != nil {
		t.Fatalf("expected missing episode excluded from navigation, got %d", *nextID)
	}
}

func newTestRepositories(t *testing.T) (*Repository, *metadata.Repository) {
	t.Helper()

	sqliteDB, err := appdb.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() {
		_ = sqliteDB.Close()
	})

	return NewRepository(sqliteDB), metadata.NewRepository(sqliteDB)
}

func writeTestMedia(t *testing.T, path string) string {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir media dir: %v", err)
	}
	if err := os.WriteFile(path, []byte("video"), 0o644); err != nil {
		t.Fatalf("write media file: %v", err)
	}
	return path
}

func createTestMedia(t *testing.T, repo *Repository, path string, title string) int64 {
	t.Helper()

	id, _, err := repo.Upsert(&MediaItem{
		Title:           title,
		MediaType:       "video",
		SourcePath:      path,
		FileName:        filepath.Base(path),
		Extension:       filepath.Ext(path),
		DurationSeconds: 1,
		TypeSource:      "auto",
		TitleSource:     "auto",
		SequenceSource:  "auto",
	})
	if err != nil {
		t.Fatalf("upsert media: %v", err)
	}
	return id
}

func createTestEpisode(t *testing.T, repo *Repository, path string, title string, episode int) int64 {
	t.Helper()

	id, _, err := repo.Upsert(&MediaItem{
		Title:           title,
		MediaType:       "series_episode",
		SourcePath:      path,
		FileName:        filepath.Base(path),
		Extension:       filepath.Ext(path),
		DurationSeconds: 1,
		SeasonNumber:    1,
		EpisodeNumber:   episode,
		TypeSource:      "auto",
		TitleSource:     "auto",
		SequenceSource:  "auto",
	})
	if err != nil {
		t.Fatalf("upsert episode: %v", err)
	}
	return id
}
