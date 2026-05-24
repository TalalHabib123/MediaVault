package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const SessionCookieName = "mv_session"

var (
	ErrSetupAlreadyComplete = errors.New("owner setup has already been completed")
	ErrSetupRequired        = errors.New("owner setup is required")
	ErrInvalidCredentials   = errors.New("invalid username or password")
	ErrUnauthenticated      = errors.New("authentication required")
	ErrForbidden            = errors.New("permission denied")
	ErrInvalidCSRF          = errors.New("invalid csrf token")
)

type Service struct {
	repo       *Repository
	authSecret []byte
	attempts   map[string]loginAttempt
	attemptMu  sync.Mutex
}

type loginAttempt struct {
	Count       int
	WindowStart time.Time
	LockedUntil time.Time
}

type SetupInput struct {
	Username       string
	Password       string
	RememberDevice bool
	DeviceLabel    string
}

type LoginInput struct {
	Username       string
	Password       string
	RememberDevice bool
	DeviceLabel    string
}

type AuthResult struct {
	User      User
	Session   Session
	Token     string
	ExpiresAt time.Time
}

func NewService(repo *Repository, rootDir string) (*Service, error) {
	secret, err := loadOrCreateSecret(rootDir)
	if err != nil {
		return nil, err
	}
	return &Service{
		repo:       repo,
		authSecret: secret,
		attempts:   make(map[string]loginAttempt),
	}, nil
}

func (s *Service) Repository() *Repository {
	return s.repo
}

func (s *Service) Setup(input SetupInput, r *http.Request) (AuthResult, error) {
	hasUser, err := s.repo.HasAnyUser()
	if err != nil {
		return AuthResult{}, err
	}
	if hasUser {
		return AuthResult{}, ErrSetupAlreadyComplete
	}

	username := strings.TrimSpace(input.Username)
	if username == "" {
		return AuthResult{}, errors.New("username is required")
	}

	hash, err := HashPassword(input.Password)
	if err != nil {
		return AuthResult{}, err
	}

	user, err := s.repo.CreateOwner(username, hash)
	if err != nil {
		return AuthResult{}, err
	}

	result, err := s.createSession(user, input.RememberDevice, input.DeviceLabel, r)
	if err != nil {
		return AuthResult{}, err
	}

	userID := user.ID
	_ = s.repo.InsertAuthEvent(Event{
		UserID:     &userID,
		EventType:  "setup_created",
		Success:    true,
		RemoteAddr: remoteHost(r),
		UserAgent:  r.UserAgent(),
	})
	return result, nil
}

func (s *Service) Login(input LoginInput, r *http.Request) (AuthResult, error) {
	key := remoteHost(r)
	if s.isRateLimited(key) {
		return AuthResult{}, errors.New("too many failed login attempts; try again later")
	}

	user, err := s.repo.FindUserByUsername(strings.TrimSpace(input.Username))
	if err != nil || !VerifyPassword(user.PasswordHash, input.Password) {
		s.recordFailedLogin(key)
		_ = s.repo.InsertAuthEvent(Event{
			EventType:  "login_failed",
			Success:    false,
			RemoteAddr: remoteHost(r),
			UserAgent:  r.UserAgent(),
		})
		return AuthResult{}, ErrInvalidCredentials
	}

	s.recordSuccessfulLogin(key)
	result, err := s.createSession(user, input.RememberDevice, input.DeviceLabel, r)
	if err != nil {
		return AuthResult{}, err
	}
	_ = s.repo.UpdateLastLogin(user.ID)

	userID := user.ID
	_ = s.repo.InsertAuthEvent(Event{
		UserID:     &userID,
		EventType:  "login_success",
		Success:    true,
		RemoteAddr: remoteHost(r),
		UserAgent:  r.UserAgent(),
	})
	return result, nil
}

func (s *Service) Logout(r *http.Request) {
	session, ok := SessionFromContext(r.Context())
	if !ok {
		if cookie, err := r.Cookie(SessionCookieName); err == nil {
			if found, err := s.repo.FindSessionByTokenHash(s.HashToken(cookie.Value)); err == nil {
				session = found
				ok = true
			}
		}
	}
	if ok {
		_ = s.repo.RevokeSession(session.ID)
		userID := session.UserID
		_ = s.repo.InsertAuthEvent(Event{
			UserID:     &userID,
			EventType:  "logout",
			Success:    true,
			RemoteAddr: remoteHost(r),
			UserAgent:  r.UserAgent(),
		})
	}
}

func (s *Service) ValidateRequest(r *http.Request) (Principal, Session, error) {
	cookie, err := r.Cookie(SessionCookieName)
	if err != nil || strings.TrimSpace(cookie.Value) == "" {
		return Principal{}, Session{}, ErrUnauthenticated
	}

	session, err := s.repo.FindSessionByTokenHash(s.HashToken(cookie.Value))
	if err != nil {
		return Principal{}, Session{}, ErrUnauthenticated
	}
	if session.RevokedAt != nil {
		return Principal{}, Session{}, ErrUnauthenticated
	}

	expiresAt, err := time.Parse(time.RFC3339, session.ExpiresAt)
	if err != nil || time.Now().UTC().After(expiresAt) {
		_ = s.repo.RevokeSession(session.ID)
		return Principal{}, Session{}, ErrUnauthenticated
	}

	user, err := s.repo.GetUserByID(session.UserID)
	if err != nil || !user.IsActive {
		return Principal{}, Session{}, ErrUnauthenticated
	}

	_ = s.repo.TouchSession(session.ID)

	return Principal{
		UserID:   user.ID,
		Username: user.Username,
		Role:     user.Role,
	}, session, nil
}

func (s *Service) CSRFToken(session Session) string {
	return session.CSRFSecret
}

func (s *Service) ValidateCSRF(r *http.Request) error {
	session, ok := SessionFromContext(r.Context())
	if !ok {
		return ErrUnauthenticated
	}
	token := strings.TrimSpace(r.Header.Get("X-CSRF-Token"))
	if token == "" {
		return ErrInvalidCSRF
	}
	if subtle.ConstantTimeCompare([]byte(token), []byte(session.CSRFSecret)) != 1 {
		return ErrInvalidCSRF
	}
	return nil
}

func (s *Service) ChangePassword(userID int64, currentPassword, newPassword string, currentSessionID int64, revokeOthers bool) error {
	user, err := s.repo.GetUserByID(userID)
	if err != nil {
		return ErrUnauthenticated
	}
	if !VerifyPassword(user.PasswordHash, currentPassword) {
		return ErrInvalidCredentials
	}

	hash, err := HashPassword(newPassword)
	if err != nil {
		return err
	}
	if err := s.repo.UpdatePassword(userID, hash); err != nil {
		return err
	}
	if revokeOthers {
		if err := s.repo.RevokeAllOtherSessions(userID, currentSessionID); err != nil {
			return err
		}
	}
	return s.repo.InsertAuthEvent(Event{
		UserID:    &userID,
		EventType: "password_changed",
		Success:   true,
	})
}

func (s *Service) HashToken(token string) string {
	sum := sha256.Sum256([]byte(token + string(s.authSecret)))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func (s *Service) createSession(user User, remember bool, deviceLabel string, r *http.Request) (AuthResult, error) {
	token, err := randomToken(32)
	if err != nil {
		return AuthResult{}, err
	}
	csrfSecret, err := randomToken(32)
	if err != nil {
		return AuthResult{}, err
	}

	now := time.Now().UTC()
	expiresAt := now.Add(24 * time.Hour)
	if remember {
		expiresAt = now.Add(30 * 24 * time.Hour)
	}

	session := Session{
		UserID:         user.ID,
		TokenHash:      s.HashToken(token),
		CSRFSecret:     csrfSecret,
		DeviceLabel:    normalizeDeviceLabel(deviceLabel, r),
		UserAgent:      r.UserAgent(),
		RemoteAddr:     remoteHost(r),
		RememberDevice: remember,
		CreatedAt:      now.Format(time.RFC3339),
		LastSeenAt:     now.Format(time.RFC3339),
		ExpiresAt:      expiresAt.Format(time.RFC3339),
	}

	created, err := s.repo.CreateSession(session)
	if err != nil {
		return AuthResult{}, err
	}

	return AuthResult{
		User:      user,
		Session:   created,
		Token:     token,
		ExpiresAt: expiresAt,
	}, nil
}

func (s *Service) isRateLimited(key string) bool {
	s.attemptMu.Lock()
	defer s.attemptMu.Unlock()
	attempt := s.attempts[key]
	return !attempt.LockedUntil.IsZero() && time.Now().Before(attempt.LockedUntil)
}

func (s *Service) recordFailedLogin(key string) {
	s.attemptMu.Lock()
	defer s.attemptMu.Unlock()
	now := time.Now()
	attempt := s.attempts[key]
	if attempt.WindowStart.IsZero() || now.Sub(attempt.WindowStart) > 15*time.Minute {
		attempt = loginAttempt{WindowStart: now}
	}
	attempt.Count++
	if attempt.Count >= 5 {
		attempt.LockedUntil = now.Add(15 * time.Minute)
	}
	s.attempts[key] = attempt
}

func (s *Service) recordSuccessfulLogin(key string) {
	s.attemptMu.Lock()
	defer s.attemptMu.Unlock()
	delete(s.attempts, key)
}

func SetSessionCookie(w http.ResponseWriter, r *http.Request, result AuthResult) {
	maxAge := int(time.Until(result.ExpiresAt).Seconds())
	if maxAge < 0 {
		maxAge = 0
	}
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    result.Token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil,
		MaxAge:   maxAge,
		Expires:  result.ExpiresAt,
	})
}

func ClearSessionCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

func randomToken(size int) (string, error) {
	raw := make([]byte, size)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func loadOrCreateSecret(rootDir string) ([]byte, error) {
	path := filepath.Join(rootDir, "data", "auth_secret")
	raw, err := os.ReadFile(path)
	if err == nil && len(strings.TrimSpace(string(raw))) > 0 {
		return []byte(strings.TrimSpace(string(raw))), nil
	}
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}

	secret, err := randomToken(48)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	if err := os.WriteFile(path, []byte(secret), 0o600); err != nil {
		return nil, err
	}
	return []byte(secret), nil
}

func remoteHost(r *http.Request) string {
	if r == nil {
		return ""
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

func normalizeDeviceLabel(label string, r *http.Request) string {
	label = strings.TrimSpace(label)
	if label != "" {
		if len(label) > 80 {
			return label[:80]
		}
		return label
	}
	host := remoteHost(r)
	if host == "" {
		return "MediaVault browser"
	}
	return fmt.Sprintf("Browser at %s", host)
}
