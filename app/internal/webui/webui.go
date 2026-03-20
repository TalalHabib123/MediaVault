package webui

import (
	"embed"
	"io"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed dist
var embedded embed.FS

func NewHandler(api http.Handler) (http.Handler, error) {
	uiFS, err := fs.Sub(embedded, "dist")
	if err != nil {
		return nil, err
	}

	fileServer := http.FileServer(http.FS(uiFS))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			api.ServeHTTP(w, r)
			return
		}

		cleaned := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if cleaned == "" || cleaned == "." {
			serveIndex(w, r, uiFS)
			return
		}

		if info, err := fs.Stat(uiFS, cleaned); err == nil && !info.IsDir() {
			fileServer.ServeHTTP(w, r)
			return
		}

		// SPA fallback
		serveIndex(w, r, uiFS)
	}), nil
}

func serveIndex(w http.ResponseWriter, _ *http.Request, uiFS fs.FS) {
	file, err := uiFS.Open("index.html")
	if err != nil {
		http.Error(w, "index.html not found in embedded UI", http.StatusInternalServerError)
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = io.Copy(w, file)
}