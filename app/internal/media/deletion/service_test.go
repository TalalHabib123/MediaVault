package deletion

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"mediavault/internal/config"
	"mediavault/internal/db"
	"mediavault/internal/library"
	"mediavault/internal/media/previews"
	"mediavault/internal/metadata"
)

type testHarness struct {
	cfgService   *config.Service
	libraryRepo  *library.Repository
	metadataRepo *metadata.Repository
	service      *Service
	closeDB      func()
	rootDir      string
}

func newTestHarness(t *testing.T) *testHarness {
	t.Helper()

	rootDir := t.TempDir()
	cfgService := config.NewService(rootDir)

	sqliteDB, err := db.Open(rootDir)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}

	libraryRepo := library.NewRepository(sqliteDB)
	metadataRepo := metadata.NewRepository(sqliteDB)
	previewService := previews.NewService(cfgService, libraryRepo)

	return &testHarness{
		cfgService:   cfgService,
		libraryRepo:  libraryRepo,
		metadataRepo: metadataRepo,
		service:      NewService(cfgService, libraryRepo, previewService),
		closeDB: func() {
			_ = sqliteDB.Close()
		},
		rootDir: rootDir,
	}
}

func (h *testHarness) createMedia(t *testing.T, sourcePath string, canonicalPath string) int64 {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("mkdir source dir: %v", err)
	}

	item := &library.MediaItem{
		Title:          "Test Media",
		MediaType:      "video",
		SourcePath:     sourcePath,
		CanonicalPath:  canonicalPath,
		FileName:       filepath.Base(sourcePath),
		Extension:      filepath.Ext(sourcePath),
		TypeSource:     "auto",
		TitleSource:    "auto",
		SequenceSource: "auto",
	}

	if _, _, err := h.libraryRepo.Upsert(item); err != nil {
		t.Fatalf("upsert media: %v", err)
	}

	items, total, err := h.libraryRepo.List("", "all", "all", 10, 0)
	if err != nil {
		t.Fatalf("list media: %v", err)
	}
	if total != 1 || len(items) != 1 {
		t.Fatalf("expected one media item, got total=%d len=%d", total, len(items))
	}

	return items[0].ID
}

func (h *testHarness) createPreviewArtifacts(t *testing.T, mediaID int64) {
	t.Helper()

	cfg, err := h.cfgService.Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	cacheRoot := h.cfgService.ResolvePath(cfg.Paths.PreviewCache)
	thumbFile := filepath.Join(cacheRoot, "thumbs", fileNameForID(mediaID, ".jpg"))
	hoverFile := filepath.Join(cacheRoot, "hover", fileNameForID(mediaID, ".mp4"))

	for _, path := range []string{thumbFile, hoverFile} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("mkdir preview dir: %v", err)
		}
		if err := os.WriteFile(path, []byte("preview"), 0o644); err != nil {
			t.Fatalf("write preview artifact: %v", err)
		}
	}
}

func fileNameForID(id int64, ext string) string {
	return fmt.Sprintf("%d%s", id, ext)
}

func TestDeleteDeleteFileRemovesFileDBRelationsAndPreviewCache(t *testing.T) {
	h := newTestHarness(t)
	defer h.closeDB()

	sourcePath := filepath.Join(h.rootDir, "media", "reference.mp4")
	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("mkdir media dir: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte("video"), 0o644); err != nil {
		t.Fatalf("write media file: %v", err)
	}

	mediaID := h.createMedia(t, sourcePath, "")
	h.createPreviewArtifacts(t, mediaID)

	person, err := h.metadataRepo.CreatePerson(metadata.CreatePersonInput{Name: "Actor One"})
	if err != nil {
		t.Fatalf("create person: %v", err)
	}
	tag, err := h.metadataRepo.CreateTag(metadata.CreateTagInput{Name: "Tag One"})
	if err != nil {
		t.Fatalf("create tag: %v", err)
	}
	category, err := h.metadataRepo.CreateCategory(metadata.CreateCategoryInput{
		Name: "Main Category",
		Kind: "main",
	})
	if err != nil {
		t.Fatalf("create category: %v", err)
	}

	if err := h.metadataRepo.ReplaceAssignments(mediaID, metadata.UpdateAssignmentsInput{
		PersonIDs:   []int64{person.ID},
		CategoryIDs: []int64{category.ID},
		TagIDs:      []int64{tag.ID},
	}); err != nil {
		t.Fatalf("replace assignments: %v", err)
	}

	result, err := h.service.Delete(mediaID, ModeDeleteFile)
	if err != nil {
		t.Fatalf("delete media: %v", err)
	}

	if !result.FileDeleted {
		t.Fatalf("expected file_deleted=true")
	}
	if !result.PreviewCacheCleaned {
		t.Fatalf("expected preview_cache_cleaned=true")
	}

	if _, err := os.Stat(sourcePath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected media file to be removed, got err=%v", err)
	}

	if _, err := h.libraryRepo.GetByID(mediaID); err == nil {
		t.Fatalf("expected media row to be deleted")
	}

	cfg, err := h.cfgService.Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	cacheRoot := h.cfgService.ResolvePath(cfg.Paths.PreviewCache)
	for _, path := range []string{
		filepath.Join(cacheRoot, "thumbs", fileNameForID(mediaID, ".jpg")),
		filepath.Join(cacheRoot, "hover", fileNameForID(mediaID, ".mp4")),
	} {
		if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("expected preview artifact to be removed, path=%s err=%v", path, err)
		}
	}
}

func TestDeleteDeleteFileUsesCanonicalPathForManagedItem(t *testing.T) {
	h := newTestHarness(t)
	defer h.closeDB()

	sourcePath := filepath.Join(h.rootDir, "sources", "managed-source.mp4")
	canonicalPath := filepath.Join(h.rootDir, "library", "managed.mp4")

	if err := os.MkdirAll(filepath.Dir(canonicalPath), 0o755); err != nil {
		t.Fatalf("mkdir canonical dir: %v", err)
	}
	if err := os.WriteFile(canonicalPath, []byte("managed"), 0o644); err != nil {
		t.Fatalf("write canonical file: %v", err)
	}

	mediaID := h.createMedia(t, sourcePath, canonicalPath)

	result, err := h.service.Delete(mediaID, ModeDeleteFile)
	if err != nil {
		t.Fatalf("delete media: %v", err)
	}
	if !result.FileDeleted {
		t.Fatalf("expected file_deleted=true")
	}

	if _, err := os.Stat(canonicalPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected canonical path to be deleted, got err=%v", err)
	}
}

func TestDeleteDBOnlyRemovesRowButLeavesFile(t *testing.T) {
	h := newTestHarness(t)
	defer h.closeDB()

	sourcePath := filepath.Join(h.rootDir, "media", "db-only.mp4")
	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("mkdir media dir: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte("video"), 0o644); err != nil {
		t.Fatalf("write media file: %v", err)
	}

	mediaID := h.createMedia(t, sourcePath, "")

	result, err := h.service.Delete(mediaID, ModeDBOnly)
	if err != nil {
		t.Fatalf("delete media: %v", err)
	}
	if result.FileDeleted {
		t.Fatalf("expected file_deleted=false")
	}

	if _, err := os.Stat(sourcePath); err != nil {
		t.Fatalf("expected file to remain on disk, got err=%v", err)
	}
	if _, err := h.libraryRepo.GetByID(mediaID); err == nil {
		t.Fatalf("expected media row to be deleted")
	}
}

func TestDeleteDeleteFileMissingReturnsConflictAndPreservesRow(t *testing.T) {
	h := newTestHarness(t)
	defer h.closeDB()

	sourcePath := filepath.Join(h.rootDir, "media", "missing.mp4")
	mediaID := h.createMedia(t, sourcePath, "")

	_, err := h.service.Delete(mediaID, ModeDeleteFile)
	if err == nil {
		t.Fatalf("expected delete to fail when file is missing")
	}

	var deleteErr *Error
	if !errors.As(err, &deleteErr) {
		t.Fatalf("expected deletion error type, got %T", err)
	}
	if deleteErr.Status != 409 {
		t.Fatalf("expected status 409, got %d", deleteErr.Status)
	}

	if _, err := h.libraryRepo.GetByID(mediaID); err != nil {
		t.Fatalf("expected media row to remain after failed file delete: %v", err)
	}
}
