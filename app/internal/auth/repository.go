package auth

import (
	"database/sql"
	"time"

	"github.com/jmoiron/sqlx"
)

type Repository struct {
	db *sqlx.DB
}

func NewRepository(db *sqlx.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) HasAnyUser() (bool, error) {
	var count int
	if err := r.db.Get(&count, `SELECT COUNT(1) FROM users WHERE is_active = 1`); err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *Repository) CreateOwner(username, passwordHash string) (User, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	result, err := r.db.Exec(`
		INSERT INTO users (username, password_hash, role, is_active, created_at, updated_at)
		VALUES (?, ?, 'owner', 1, ?, ?)
	`, username, passwordHash, now, now)
	if err != nil {
		return User{}, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return User{}, err
	}
	return r.GetUserByID(id)
}

func (r *Repository) FindUserByUsername(username string) (User, error) {
	var user User
	err := r.db.Get(&user, `
		SELECT id, username, password_hash, role, is_active, created_at, updated_at, last_login_at
		FROM users
		WHERE lower(username) = lower(?) AND is_active = 1
		LIMIT 1
	`, username)
	return user, err
}

func (r *Repository) GetUserByID(id int64) (User, error) {
	var user User
	err := r.db.Get(&user, `
		SELECT id, username, password_hash, role, is_active, created_at, updated_at, last_login_at
		FROM users
		WHERE id = ? AND is_active = 1
	`, id)
	return user, err
}

func (r *Repository) CreateSession(session Session) (Session, error) {
	result, err := r.db.Exec(`
		INSERT INTO auth_sessions (
			user_id, token_hash, csrf_secret, device_label, user_agent, remote_addr,
			remember_device, created_at, last_seen_at, expires_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		session.UserID,
		session.TokenHash,
		session.CSRFSecret,
		session.DeviceLabel,
		session.UserAgent,
		session.RemoteAddr,
		boolToInt(session.RememberDevice),
		session.CreatedAt,
		session.LastSeenAt,
		session.ExpiresAt,
	)
	if err != nil {
		return Session{}, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return Session{}, err
	}
	return r.GetSessionByID(id)
}

func (r *Repository) GetSessionByID(id int64) (Session, error) {
	var session Session
	err := r.db.Get(&session, `
		SELECT id, user_id, token_hash, csrf_secret, device_label, user_agent, remote_addr,
			remember_device, created_at, last_seen_at, expires_at, revoked_at
		FROM auth_sessions
		WHERE id = ?
	`, id)
	return session, err
}

func (r *Repository) FindSessionByTokenHash(tokenHash string) (Session, error) {
	var session Session
	err := r.db.Get(&session, `
		SELECT id, user_id, token_hash, csrf_secret, device_label, user_agent, remote_addr,
			remember_device, created_at, last_seen_at, expires_at, revoked_at
		FROM auth_sessions
		WHERE token_hash = ?
		LIMIT 1
	`, tokenHash)
	return session, err
}

func (r *Repository) TouchSession(id int64) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := r.db.Exec(`UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?`, now, id)
	return err
}

func (r *Repository) UpdateLastLogin(userID int64) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := r.db.Exec(`UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?`, now, now, userID)
	return err
}

func (r *Repository) RevokeSession(id int64) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := r.db.Exec(`
		UPDATE auth_sessions
		SET revoked_at = COALESCE(revoked_at, ?)
		WHERE id = ?
	`, now, id)
	return err
}

func (r *Repository) RevokeAllOtherSessions(userID, currentSessionID int64) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := r.db.Exec(`
		UPDATE auth_sessions
		SET revoked_at = COALESCE(revoked_at, ?)
		WHERE user_id = ? AND id <> ? AND revoked_at IS NULL
	`, now, userID, currentSessionID)
	return err
}

func (r *Repository) ListSessions(userID int64) ([]Session, error) {
	var sessions []Session
	err := r.db.Select(&sessions, `
		SELECT id, user_id, token_hash, csrf_secret, device_label, user_agent, remote_addr,
			remember_device, created_at, last_seen_at, expires_at, revoked_at
		FROM auth_sessions
		WHERE user_id = ? AND revoked_at IS NULL
		ORDER BY last_seen_at DESC
	`, userID)
	return sessions, err
}

func (r *Repository) InsertAuthEvent(event Event) error {
	_, err := r.db.Exec(`
		INSERT INTO auth_events (user_id, event_type, success, remote_addr, user_agent, details, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`,
		event.UserID,
		event.EventType,
		boolToInt(event.Success),
		event.RemoteAddr,
		event.UserAgent,
		event.Details,
		time.Now().UTC().Format(time.RFC3339),
	)
	return err
}

func (r *Repository) UpdatePassword(userID int64, passwordHash string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := r.db.Exec(`
		UPDATE users
		SET password_hash = ?, updated_at = ?
		WHERE id = ?
	`, passwordHash, now, userID)
	return err
}

func (r *Repository) DeleteAllAuthDataForDev() error {
	_, err := r.db.Exec(`DELETE FROM auth_events`)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(`DELETE FROM auth_sessions`)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(`DELETE FROM users`)
	return err
}

func IsNotFound(err error) bool {
	return err == sql.ErrNoRows
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
