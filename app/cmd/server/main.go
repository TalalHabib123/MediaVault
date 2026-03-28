package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	"mediavault/internal/api"
	"mediavault/internal/config"
	"mediavault/internal/db"
	"mediavault/internal/library"
	"mediavault/internal/media/deletion"
	"mediavault/internal/media/organizer"
	"mediavault/internal/media/previews"
	"mediavault/internal/media/scanner"
	"mediavault/internal/metadata"
	"mediavault/internal/system/actions"
	"mediavault/internal/webui"
)

func main() {
	rootDir, err := resolveRootDir()
	if err != nil {
		log.Fatalf("failed to resolve root dir: %v", err)
	}

	cfgService := config.NewService(rootDir)

	cfg, err := cfgService.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	sqliteDB, err := db.Open(rootDir)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer sqliteDB.Close()

	libraryRepo := library.NewRepository(sqliteDB)
	metadataRepo := metadata.NewRepository(sqliteDB)
	scanService := scanner.NewService(cfgService, libraryRepo)
	organizerService := organizer.NewService(cfgService, libraryRepo)
	previewService := previews.NewService(cfgService)
	deletionService := deletion.NewService(cfgService, libraryRepo, previewService)
	actionsService := actions.NewService(cfgService)

	router := api.NewRouter(&api.Server{
		ConfigService: cfgService,
		LibraryRepo:   libraryRepo,
		MetadataRepo:  metadataRepo,
		Scanner:       scanService,
		Organizer:     organizerService,
		Previewer:     previewService,
		Deletion:      deletionService,
		Actions:       actionsService,
	})

	handler, err := webui.NewHandler(router)
	if err != nil {
		log.Fatalf("failed to create embedded web handler: %v", err)
	}

	addr := cfg.Server.Host + ":" + itoa(cfg.Server.Port)

	log.Printf("MediaVault server listening on http://%s", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("server stopped: %v", err)
	}
}

func resolveRootDir() (string, error) {
	cwd, _ := os.Getwd()
	exePath, _ := os.Executable()
	exeDir := filepath.Dir(exePath)

	candidates := []string{
		cwd,
		filepath.Dir(cwd),
		exeDir,
		filepath.Dir(exeDir),
	}

	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if exists(filepath.Join(candidate, "config")) || exists(filepath.Join(candidate, "bin")) || exists(filepath.Join(candidate, "data")) {
			return candidate, nil
		}
	}

	return filepath.Dir(cwd), nil
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	sign := ""
	if n < 0 {
		sign = "-"
		n = -n
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + (n % 10))}, digits...)
		n /= 10
	}
	return sign + string(digits)
}
