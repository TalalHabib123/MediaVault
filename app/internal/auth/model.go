package auth

import "context"

type contextKey string

const (
	principalContextKey contextKey = "auth_principal"
	sessionContextKey   contextKey = "auth_session"
)

type User struct {
	ID           int64   `db:"id"`
	Username     string  `db:"username"`
	PasswordHash string  `db:"password_hash"`
	Role         string  `db:"role"`
	IsActive     bool    `db:"is_active"`
	CreatedAt    string  `db:"created_at"`
	UpdatedAt    string  `db:"updated_at"`
	LastLoginAt  *string `db:"last_login_at"`
}

type Session struct {
	ID             int64   `db:"id"`
	UserID         int64   `db:"user_id"`
	TokenHash      string  `db:"token_hash"`
	CSRFSecret     string  `db:"csrf_secret"`
	DeviceLabel    string  `db:"device_label"`
	UserAgent      string  `db:"user_agent"`
	RemoteAddr     string  `db:"remote_addr"`
	RememberDevice bool    `db:"remember_device"`
	CreatedAt      string  `db:"created_at"`
	LastSeenAt     string  `db:"last_seen_at"`
	ExpiresAt      string  `db:"expires_at"`
	RevokedAt      *string `db:"revoked_at"`
}

type Principal struct {
	UserID   int64  `json:"id"`
	Username string `json:"username"`
	Role     string `json:"role"`
}

type SessionSummary struct {
	ID             int64  `json:"id"`
	DeviceLabel    string `json:"device_label"`
	UserAgent      string `json:"user_agent"`
	RemoteAddr     string `json:"remote_addr"`
	RememberDevice bool   `json:"remember_device"`
	CreatedAt      string `json:"created_at"`
	LastSeenAt     string `json:"last_seen_at"`
	ExpiresAt      string `json:"expires_at"`
	Current        bool   `json:"current"`
}

type Event struct {
	UserID     *int64
	EventType  string
	Success    bool
	RemoteAddr string
	UserAgent  string
	Details    string
}

type RequestContext struct {
	Principal Principal
	Session   Session
}

func PrincipalFromContext(ctx context.Context) (Principal, bool) {
	value, ok := ctx.Value(principalContextKey).(Principal)
	return value, ok
}

func SessionFromContext(ctx context.Context) (Session, bool) {
	value, ok := ctx.Value(sessionContextKey).(Session)
	return value, ok
}

func WithRequestContext(ctx context.Context, principal Principal, session Session) context.Context {
	ctx = context.WithValue(ctx, principalContextKey, principal)
	ctx = context.WithValue(ctx, sessionContextKey, session)
	return ctx
}
