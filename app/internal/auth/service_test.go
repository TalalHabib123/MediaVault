package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"mediavault/internal/db"
)

func TestSetupLoginSessionAndCSRF(t *testing.T) {
	rootDir := t.TempDir()
	sqliteDB, err := db.Open(rootDir)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer sqliteDB.Close()

	repo := NewRepository(sqliteDB)
	service, err := NewService(repo, rootDir)
	if err != nil {
		t.Fatalf("new auth service: %v", err)
	}

	setupReq := httptest.NewRequest(http.MethodPost, "/api/auth/setup", nil)
	setupReq.RemoteAddr = "127.0.0.1:50000"
	setupResult, err := service.Setup(SetupInput{
		Username:       "owner",
		Password:       "correct horse battery staple",
		RememberDevice: true,
		DeviceLabel:    "test browser",
	}, setupReq)
	if err != nil {
		t.Fatalf("setup owner: %v", err)
	}
	if setupResult.User.Role != "owner" {
		t.Fatalf("expected owner role, got %q", setupResult.User.Role)
	}

	if _, err := service.Setup(SetupInput{
		Username: "second",
		Password: "correct horse battery staple",
	}, setupReq); err != ErrSetupAlreadyComplete {
		t.Fatalf("expected setup to be one-time, got %v", err)
	}

	loginReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	loginReq.RemoteAddr = "127.0.0.1:50001"
	if _, err := service.Login(LoginInput{
		Username: "owner",
		Password: "wrong password",
	}, loginReq); err != ErrInvalidCredentials {
		t.Fatalf("expected invalid credentials, got %v", err)
	}

	loginResult, err := service.Login(LoginInput{
		Username:       "OWNER",
		Password:       "correct horse battery staple",
		RememberDevice: false,
		DeviceLabel:    "test login",
	}, loginReq)
	if err != nil {
		t.Fatalf("login: %v", err)
	}

	sessionReq := httptest.NewRequest(http.MethodGet, "/api/library", nil)
	sessionReq.AddCookie(&http.Cookie{Name: SessionCookieName, Value: loginResult.Token})
	principal, session, err := service.ValidateRequest(sessionReq)
	if err != nil {
		t.Fatalf("validate request: %v", err)
	}
	if principal.Username != "owner" {
		t.Fatalf("expected canonical username, got %q", principal.Username)
	}

	csrfReq := httptest.NewRequest(http.MethodPost, "/api/library/1/delete", nil)
	csrfReq = csrfReq.WithContext(WithRequestContext(csrfReq.Context(), principal, session))
	if err := service.ValidateCSRF(csrfReq); err != ErrInvalidCSRF {
		t.Fatalf("expected missing csrf to fail, got %v", err)
	}
	csrfReq.Header.Set("X-CSRF-Token", service.CSRFToken(session))
	if err := service.ValidateCSRF(csrfReq); err != nil {
		t.Fatalf("expected csrf to pass: %v", err)
	}
}
