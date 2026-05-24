package auth

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"mediavault/internal/config"
)

type Gate struct {
	Service       *Service
	ConfigService *config.Service
}

func (g Gate) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		SecurityHeaders(w)

		if isPublicRoute(r.Method, r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		hasUser, err := g.Service.repo.HasAnyUser()
		if err != nil {
			writeAuthError(w, http.StatusInternalServerError, "failed to read auth status")
			return
		}
		if !hasUser {
			writeAuthError(w, http.StatusForbidden, ErrSetupRequired.Error())
			return
		}

		principal, session, err := g.Service.ValidateRequest(r)
		if err != nil {
			writeAuthError(w, http.StatusUnauthorized, ErrUnauthenticated.Error())
			return
		}

		r = r.WithContext(WithRequestContext(r.Context(), principal, session))

		if isUnsafeMethod(r.Method) {
			if err := g.checkOrigin(r); err != nil {
				writeAuthError(w, http.StatusForbidden, err.Error())
				return
			}
			if err := g.Service.ValidateCSRF(r); err != nil {
				writeAuthError(w, http.StatusForbidden, ErrInvalidCSRF.Error())
				return
			}
		}

		if requiresOwner(r.Method, r.URL.Path) && principal.Role != "owner" {
			writeAuthError(w, http.StatusForbidden, ErrForbidden.Error())
			return
		}

		next.ServeHTTP(w, r)
	})
}

func SecurityHeaders(w http.ResponseWriter) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "same-origin")
	w.Header().Set("X-Frame-Options", "DENY")
}

func isPublicRoute(method, path string) bool {
	switch {
	case method == http.MethodGet && path == "/api/health":
		return true
	case method == http.MethodGet && path == "/api/auth/status":
		return true
	case method == http.MethodPost && path == "/api/auth/setup":
		return true
	case method == http.MethodPost && path == "/api/auth/login":
		return true
	case method == http.MethodPost && path == "/api/auth/logout":
		return true
	default:
		return false
	}
}

func isUnsafeMethod(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}

func requiresOwner(method, path string) bool {
	if strings.HasPrefix(path, "/api/auth/") {
		return false
	}
	if path == "/api/settings" || path == "/api/settings/security" {
		return true
	}
	if path == "/api/scan/run" || strings.HasPrefix(path, "/api/previews/regenerate") {
		return true
	}
	if strings.Contains(path, "/open-vlc") || strings.Contains(path, "/reveal-file") {
		return true
	}
	if strings.HasPrefix(path, "/api/metadata/") && method != http.MethodGet {
		return true
	}
	return isUnsafeMethod(method)
}

func (g Gate) checkOrigin(r *http.Request) error {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		origin = strings.TrimSpace(r.Header.Get("Referer"))
	}
	if origin == "" {
		return nil
	}

	originURL, err := url.Parse(origin)
	if err != nil {
		return ErrForbidden
	}

	requestHost := r.Host
	if strings.EqualFold(originURL.Host, requestHost) {
		return nil
	}

	if isLoopbackHost(originURL.Hostname()) {
		return nil
	}

	cfg, err := g.ConfigService.Load()
	if err == nil {
		for _, allowed := range cfg.Security.AllowedOrigins {
			if strings.EqualFold(strings.TrimRight(allowed, "/"), strings.TrimRight(originURL.Scheme+"://"+originURL.Host, "/")) {
				return nil
			}
		}
	}

	return ErrForbidden
}

func writeAuthError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": message,
	})
}
