package main

import (
	"bufio"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"mediavault/internal/api"
	"mediavault/internal/auth"
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
	authRepo := auth.NewRepository(sqliteDB)
	authService, err := auth.NewService(authRepo, rootDir)
	if err != nil {
		log.Fatalf("failed to initialize auth: %v", err)
	}

	if os.Getenv("MEDIAVAULT_AUTH_RESET") == "1" {
		if err := authRepo.DeleteAllAuthDataForDev(); err != nil {
			log.Fatalf("failed to reset auth data: %v", err)
		}
		log.Printf("development auth reset complete")
	}

	accessMode, err := applyStartupAccessMode(cfg, authRepo)
	if err != nil {
		log.Fatalf("failed to apply access mode: %v", err)
	}

	scanService := scanner.NewService(cfgService, libraryRepo)
	organizerService := organizer.NewService(cfgService, libraryRepo)
	previewService := previews.NewService(cfgService, libraryRepo)
	deletionService := deletion.NewService(cfgService, libraryRepo, previewService)
	actionsService := actions.NewService(cfgService)

	router := api.NewRouter(&api.Server{
		ConfigService: cfgService,
		AuthService:   authService,
		AccessMode:    accessMode,
		BindHost:      cfg.Server.Host,
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

func applyStartupAccessMode(cfg *config.AppConfig, authRepo *auth.Repository) (string, error) {
	mode := strings.ToLower(strings.TrimSpace(os.Getenv("MEDIAVAULT_ACCESS_MODE")))
	if mode == "" && isInteractiveTerminal() {
		fmt.Println("")
		fmt.Println("MediaVault access mode")
		fmt.Println("1) Local only (localhost)")
		fmt.Println("2) LAN mode (0.0.0.0, requires owner setup)")
		fmt.Print("Select mode [1]: ")
		answer, _ := bufio.NewReader(os.Stdin).ReadString('\n')
		answer = strings.TrimSpace(strings.ToLower(answer))
		if answer == "2" || answer == "lan" {
			mode = "lan"
		} else {
			mode = "local"
		}
	}
	if mode == "" {
		mode = "local"
	}

	hasUser, err := authRepo.HasAnyUser()
	if err != nil {
		return "", err
	}

	switch mode {
	case "lan":
		if !hasUser {
			log.Printf("LAN mode requested, but owner setup is not complete; binding to localhost until setup is finished")
			cfg.Server.Host = "localhost"
			cfg.Security.LANEnabled = false
			cfg.Security.BindHost = "localhost"
			mode = "local"
			break
		}
		cfg.Server.Host = "0.0.0.0"
		cfg.Security.LANEnabled = true
		cfg.Security.BindHost = "0.0.0.0"
	case "local":
		cfg.Server.Host = "localhost"
		cfg.Security.LANEnabled = false
		cfg.Security.BindHost = "localhost"
	default:
		return "", fmt.Errorf("unknown access mode %q", mode)
	}

	return mode, nil
}

func isInteractiveTerminal() bool {
	info, err := os.Stdin.Stat()
	if err != nil {
		return false
	}
	return (info.Mode() & os.ModeCharDevice) != 0
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
