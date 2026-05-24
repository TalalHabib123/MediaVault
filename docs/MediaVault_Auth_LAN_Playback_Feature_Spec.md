# MediaVault Authentication, LAN Access, And Playback Feature Spec

## Purpose

This document defines the feature design for adding application login, trusted device sessions, safe LAN access, and correct playback behavior for MediaVault.

The current implementation is a local-first Go + React web app. It already supports media scanning, SQLite metadata, thumbnails, hover previews, browser streaming, VLC launch, file reveal, delete, and managed moves. The missing piece is security. The app must not be exposed to the LAN until authentication and route protection are implemented.

This document is written for an implementation agent.

---

## Current System Facts From Project Specification

Use these facts as constraints:

- Backend: Go with `chi`.
- Frontend: React + Vite + TypeScript.
- Database: SQLite through `modernc.org/sqlite` and `sqlx`.
- Server currently defaults to loopback host `127.0.0.1`.
- Current portable/dev config uses port `5000`.
- Auth is currently not implemented.
- Every current API route is unauthenticated.
- Dangerous actions already exist:
  - delete physical file
  - DB-only cleanup
  - move files to managed library
  - change source/library/tool paths
  - scan configured folders
  - stream media
  - open VLC on the host machine
  - reveal file in Windows Explorer
- Browser streaming already works through `GET /api/library/{id}/stream` and uses `http.ServeContent`, so range requests are supported.
- VLC playback is host-machine only. A remote browser calling the VLC endpoint would launch VLC on the server laptop, not on the client PC.
- Local filesystem paths are returned in media/settings APIs today.
- There is no CSRF protection, CORS middleware, structured logging, or auth/session model.

---

## Design Position

### Correct Direction

MediaVault should support two safe modes:

1. **Local Mode**
   - Server binds to `127.0.0.1`.
   - Login is still required.
   - Host-only actions are allowed after login.

2. **LAN Mode**
   - Server binds to a LAN-accessible address only after auth is fully configured.
   - Login is required.
   - Remote clients can browse and stream in the browser.
   - Remote clients must not be able to launch VLC or reveal folders on the host machine.
   - Admin-only destructive actions must be protected.

### Explicit Non-Goals For This Feature

Do **not** implement these in the first pass:

- Public internet exposure.
- Port-forwarding based remote access.
- Cloud accounts.
- OAuth/social login.
- Multi-server sync.
- Full Plex/Jellyfin-style transcoding.
- Remote client VLC auto-launch.
- Browser plugin or desktop companion for client-side VLC.
- HTTPS certificate automation unless explicitly added later.

For access outside the home/office LAN, recommend VPN-style access later, such as Tailscale or WireGuard. Do not design this as an internet-facing app yet.

---

# 1. Feature Overview

## 1.1 Feature Parts

This feature has two parts:

### Part A: Login And Trusted Devices

Add secure login for the entire application.

Capabilities:

- First-run owner setup.
- Login screen.
- Secure password hashing.
- Server-side sessions.
- HTTP-only session cookie.
- Remember device option.
- Session/device management UI.
- Logout.
- Change password.
- Auth middleware protecting all routes.
- CSRF protection for unsafe methods.
- Login rate limiting.

### Part B: LAN Access And Playback Behavior

Add safe network access behavior.

Capabilities:

- Explicit LAN mode toggle.
- Bind host only after security checks pass.
- System capability endpoint.
- Host-vs-remote device detection.
- Browser streaming for remote clients.
- Host-only VLC and reveal-folder actions.
- UI labels for unavailable host actions.
- Optional future signed stream URL for opening remote VLC manually.

---

# 2. Product-Level User Flows

## 2.1 First Run Setup

When the app starts and no owner account exists:

1. User opens MediaVault.
2. App calls `GET /api/auth/status`.
3. Backend returns `setup_required: true`.
4. Frontend redirects to `/setup`.
5. User creates owner account:
   - username
   - password
   - confirm password
6. Backend creates owner user.
7. Backend creates authenticated session.
8. Frontend redirects to dashboard.

Rules:

- Until setup is complete, only these routes should be available:
  - `GET /api/health`
  - `GET /api/auth/status`
  - `POST /api/auth/setup`
- All media, settings, stream, and destructive routes must be blocked during setup.

## 2.2 Normal Login

1. User opens app.
2. Frontend calls `GET /api/auth/status`.
3. If not authenticated, redirect to `/login`.
4. User enters username/password.
5. Optional: user checks `Remember this device`.
6. Backend validates password.
7. Backend creates server-side session.
8. Backend sets `mv_session` HTTP-only cookie.
9. Frontend redirects to originally requested page or dashboard.

## 2.3 Remember Device

When enabled:

- Session gets a longer expiry.
- Device appears in Security Settings.
- User can revoke remembered devices.
- Revoking a device invalidates active sessions associated with it.

Recommended expiries:

| Session Type | Expiry |
|---|---|
| Normal session | 12 hours idle, 24 hours max |
| Remembered device | 30 days |
| Password change | revoke all other sessions |

Keep this simple. Do not build a complex refresh-token system unless needed later.

## 2.4 Host PC Usage

When user accesses from the server laptop using `localhost` or `127.0.0.1`:

- Browser playback is available.
- VLC open is available if VLC path is configured.
- Reveal in folder is available.
- Settings, scan, metadata edits, moves, and deletes are available to owner/admin.

## 2.5 Remote LAN Client Usage

When user accesses from another PC/mobile device on the LAN:

- Login is required.
- Browse library is available.
- Thumbnail/hover previews are available after login.
- Browser streaming is available.
- VLC open must be hidden or disabled with explanation:
  - `VLC opens only on the host PC. Use browser playback on this device.`
- Reveal in folder must be hidden or disabled.
- Destructive/admin actions should only be available to owner/admin.
- Raw host file paths should be hidden from non-admin users.

---

# 3. Security Architecture

## 3.1 Use Server-Side Opaque Sessions

Use opaque random session tokens, not JWTs.

Reason:

- This is a local app with SQLite.
- Server-side revocation is simple.
- Device/session management is easier.
- Tokens can be invalidated immediately.
- No token payload leakage.

Session cookie:

```text
Name: mv_session
Value: random base64url token
HttpOnly: true
SameSite: Lax
Path: /
Secure: true only when request is HTTPS
MaxAge: based on session type
```

Important:

- Do not store session tokens in localStorage.
- Do not store password hashes in config.
- Do not expose session token to frontend JavaScript.
- Store only a hash of the session token in SQLite.

## 3.2 Password Hashing

Use `golang.org/x/crypto/bcrypt` for the first version.

Recommended:

```text
bcrypt cost: 12
```

Reason:

- Simple.
- Mature.
- Easy to implement correctly in Go.
- Good enough for a local/LAN app.

Do not use plain SHA256 for passwords.

## 3.3 Session Token Storage

Generate a random token:

```go
crypto/rand -> 32 bytes -> base64.RawURLEncoding
```

Store:

```text
token_hash = SHA256(raw_token + server_auth_secret)
```

The raw token only goes into the HTTP-only cookie.

The server auth secret should be generated once and stored outside the DB:

```text
data/auth_secret
```

Rules:

- Generate if missing.
- File permission best effort on Windows.
- Never print it in logs.
- Never return it from APIs.

## 3.4 CSRF Protection

Because auth uses cookies, add CSRF protection for unsafe methods:

Unsafe methods:

- POST
- PUT
- PATCH
- DELETE

Acceptable first implementation:

1. On session creation, generate `csrf_secret`.
2. Frontend calls `GET /api/auth/csrf`.
3. Backend returns a CSRF token only if authenticated.
4. Frontend sends it as header:

```text
X-CSRF-Token: <token>
```

5. Middleware validates the token for unsafe methods.

Also add Origin/Referer checks for unsafe methods:

- Allow same-origin.
- Allow configured LAN origin(s).
- Reject cross-site unsafe requests.

Do not rely only on SameSite cookies.

## 3.5 Route Protection

Route categories:

### Public Routes

Only these should be public:

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/auth/status` | Setup/auth status |
| POST | `/api/auth/setup` | First owner setup only |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout, should tolerate missing session |

### Authenticated Read Routes

Require login:

| Route Pattern | Notes |
|---|---|
| `GET /api/library` | Library browsing |
| `GET /api/library/{id}` | Detail |
| `GET /api/library/{id}/thumbnail` | Thumbnail |
| `GET /api/library/{id}/hover-preview` | Hover preview |
| `GET /api/library/{id}/stream` | Browser stream |
| `GET /api/library/{id}/player-context` | Player context |
| `GET /api/metadata/options` | Metadata options |
| `GET /api/search/tagged` | Tagged search |
| `GET /api/system/capabilities` | Device/server capabilities |

### Admin / Owner Routes

Require login and admin/owner role:

| Route Pattern | Reason |
|---|---|
| `PUT /api/settings` | Can expose or mutate host paths |
| `PUT /api/settings/security` | Security critical |
| `POST /api/scan/run` | Can read configured folders |
| `POST /api/previews/regenerate` | Heavy backend job |
| `PATCH /api/library/{id}` | Metadata mutation |
| `PATCH /api/library/{id}/tagging` | Metadata mutation |
| `POST /api/library/bulk/tagging` | Bulk mutation |
| `POST /api/library/{id}/delete` | Destructive |
| `POST /api/library/{id}/move-to-library*` | File mutation |
| `POST /api/library/bulk/move-to-library*` | Bulk file mutation |
| `POST /api/library/{id}/open-vlc` | Host process launch |
| `POST /api/library/{id}/reveal-file` | Host file path action |
| `POST /api/metadata/*` | Metadata creation |

For MVP, one owner account is enough. Still include a `role` field so viewer accounts can be added later without schema churn.

## 3.6 Recommended Roles

Use roles, but keep the UI owner-only in the first pass.

| Role | Purpose |
|---|---|
| `owner` | Full access, can change security/settings, delete/move files |
| `viewer` | Future role; browse and stream only |

MVP can create only `owner`.

---

# 4. Database Changes

Add these tables through the current in-code migration style first. Later, move to versioned migrations.

## 4.1 `users`

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);
```

Rules:

- Username comparison should be case-insensitive during login.
- Do not allow empty passwords.
- Enforce minimum password length in backend and frontend.

Recommended password policy:

- Minimum 10 characters.
- Do not require annoying symbol rules.
- Show strength guidance.

## 4.2 `auth_sessions`

```sql
CREATE TABLE IF NOT EXISTS auth_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_secret TEXT NOT NULL,
  device_label TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  remote_addr TEXT NOT NULL DEFAULT '',
  remember_device INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
```

## 4.3 `auth_events`

```sql
CREATE TABLE IF NOT EXISTS auth_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  event_type TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 1,
  remote_addr TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_events_created_at ON auth_events(created_at);
CREATE INDEX IF NOT EXISTS idx_auth_events_user_id ON auth_events(user_id);
```

Event types:

- `setup_created`
- `login_success`
- `login_failed`
- `logout`
- `session_revoked`
- `password_changed`
- `lan_enabled`
- `lan_disabled`

## 4.4 Optional Future: `trusted_devices`

Skip this table for MVP unless the implementation really needs it.

A remembered session already provides the practical “remember this device” behavior. Add a dedicated trusted device table later if device grouping becomes important.

---

# 5. Backend Package Design

Add a new package:

```text
app/internal/auth/
├── model.go
├── repository.go
├── service.go
├── middleware.go
├── csrf.go
└── password.go
```

## 5.1 Models

```go
type User struct {
    ID           int64
    Username     string
    PasswordHash string
    Role         string
    IsActive     bool
    CreatedAt    string
    UpdatedAt    string
    LastLoginAt  *string
}

type Session struct {
    ID             int64
    UserID         int64
    TokenHash      string
    CSRFSecret     string
    DeviceLabel    string
    UserAgent      string
    RemoteAddr     string
    RememberDevice bool
    CreatedAt      string
    LastSeenAt     string
    ExpiresAt      string
    RevokedAt      *string
}

type Principal struct {
    UserID   int64  `json:"id"`
    Username string `json:"username"`
    Role     string `json:"role"`
}
```

## 5.2 Repository Responsibilities

`auth.Repository` should handle:

- `HasAnyUser()`
- `CreateOwner(username, passwordHash)`
- `FindUserByUsername(username)`
- `GetUserByID(id)`
- `CreateSession(...)`
- `FindSessionByTokenHash(tokenHash)`
- `TouchSession(id)`
- `RevokeSession(id)`
- `RevokeAllOtherSessions(userID, currentSessionID)`
- `ListSessions(userID)`
- `InsertAuthEvent(...)`

## 5.3 Service Responsibilities

`auth.Service` should handle:

- Password hashing/verification.
- First setup.
- Login.
- Logout.
- Session validation.
- CSRF token generation/validation.
- Rate limiting.
- Session expiry decisions.
- Auth event logging.

## 5.4 Middleware

Add middleware:

```go
RequireAuth(next http.Handler) http.Handler
RequireRole(role string, next http.Handler) http.Handler
RequireCSRF(next http.Handler) http.Handler
SecurityHeaders(next http.Handler) http.Handler
OriginCheck(next http.Handler) http.Handler
```

Implementation detail:

- Attach principal and session to request context.
- Do not call DB repeatedly in handlers if middleware already loaded the user/session.
- For stream endpoints, auth middleware must support range requests normally.

---

# 6. New API Endpoints

## 6.1 Auth Status

```http
GET /api/auth/status
```

Response:

```ts
type AuthStatusResponse = {
  setup_required: boolean;
  authenticated: boolean;
  user: null | {
    id: number;
    username: string;
    role: "owner" | "viewer";
  };
  lan_enabled: boolean;
};
```

## 6.2 Setup

```http
POST /api/auth/setup
```

Request:

```ts
type SetupRequest = {
  username: string;
  password: string;
  remember_device?: boolean;
  device_label?: string;
};
```

Rules:

- Allowed only when no user exists.
- Creates owner account.
- Creates session.
- Returns user.

## 6.3 Login

```http
POST /api/auth/login
```

Request:

```ts
type LoginRequest = {
  username: string;
  password: string;
  remember_device: boolean;
  device_label?: string;
};
```

Response:

```ts
type LoginResponse = {
  ok: true;
  user: {
    id: number;
    username: string;
    role: string;
  };
};
```

## 6.4 Logout

```http
POST /api/auth/logout
```

Behavior:

- Revoke current session if present.
- Clear cookie.
- Return `{ ok: true }`.

## 6.5 Current User

```http
GET /api/auth/me
```

Response:

```ts
type MeResponse = {
  user: {
    id: number;
    username: string;
    role: string;
  };
  session: {
    id: number;
    device_label: string;
    remember_device: boolean;
    created_at: string;
    last_seen_at: string;
    expires_at: string;
  };
};
```

## 6.6 CSRF Token

```http
GET /api/auth/csrf
```

Response:

```ts
type CsrfResponse = {
  csrf_token: string;
};
```

Frontend stores this in memory, not localStorage.

## 6.7 Sessions

```http
GET /api/auth/sessions
DELETE /api/auth/sessions/{id}
```

Rules:

- Owner can list and revoke own sessions.
- Current session should be marked in response.

## 6.8 Change Password

```http
POST /api/auth/change-password
```

Request:

```ts
type ChangePasswordRequest = {
  current_password: string;
  new_password: string;
  revoke_other_sessions: boolean;
};
```

## 6.9 System Capabilities

```http
GET /api/system/capabilities
```

Response:

```ts
type SystemCapabilities = {
  access_mode: "local" | "lan";
  request_context: {
    is_loopback: boolean;
    is_host_capable: boolean;
  };
  capabilities: {
    browser_playback: boolean;
    open_vlc_on_host: boolean;
    reveal_file_on_host: boolean;
    settings_admin: boolean;
    file_mutations: boolean;
  };
  warnings: string[];
};
```

Rules:

- `open_vlc_on_host` should be true only when:
  - user is owner/admin
  - request is from loopback/host context
  - VLC path is configured and executable exists
- `reveal_file_on_host` should be true only for host context.
- Remote LAN clients get browser playback only.

## 6.10 Security Settings

```http
GET /api/settings/security
PUT /api/settings/security
```

Response/request model:

```ts
type SecuritySettings = {
  auth_enabled: true;
  lan_enabled: boolean;
  bind_host: "127.0.0.1" | "0.0.0.0" | string;
  allowed_origins: string[];
  session_idle_minutes: number;
  remembered_device_days: number;
  failed_login_limit: number;
};
```

Rules:

- `auth_enabled` should not be set to false from UI once setup is complete.
- LAN mode cannot be enabled unless owner account exists.
- LAN mode cannot be enabled if default/weak password checks fail.
- Changing bind host may require app restart; be clear in UI.

---

# 7. Existing Route Changes

## 7.1 Wrap All Existing API Routes

Current `api.NewRouter` should be restructured into route groups:

```go
r.Route("/api", func(r chi.Router) {
    r.Group(publicRoutes)
    r.Group(authenticatedRoutes)
    r.Group(adminRoutes)
})
```

Do not leave old routes accidentally public.

## 7.2 Protect Static SPA

The SPA can be served publicly, but all app data APIs must be protected.

Frontend routing rule:

- unauthenticated user can only see `/login` and `/setup`.
- authenticated user can see the app.

Do not rely on frontend route guards for security. Backend middleware is required.

## 7.3 Stream, Thumbnail, And Hover Routes

These must require auth.

Reason:

- Media files are private.
- Thumbnails and hover previews can leak private content.
- Stream endpoints expose the actual library.

Make sure video range requests still work after auth middleware.

---

# 8. LAN Mode Design

## 8.1 Binding Behavior

Current safe default should remain:

```text
127.0.0.1:5000
```

LAN mode can change to:

```text
0.0.0.0:5000
```

or a selected LAN IP.

Rules:

- Do not auto-enable LAN mode.
- Do not bind to `0.0.0.0` without setup complete.
- Show warning before enabling.
- Require password confirmation before enabling LAN mode.
- Restart may be required.

## 8.2 LAN URL Display

When LAN mode is enabled, show:

```text
Local access:
http://127.0.0.1:5000

LAN access:
http://<detected-lan-ip>:5000
```

If multiple network interfaces exist, list candidates and let user choose/copy.

## 8.3 CORS Policy

For same-origin SPA usage, CORS is not needed.

Do not add:

```text
Access-Control-Allow-Origin: *
```

If CORS is needed later, restrict it to configured origins only.

## 8.4 Host/Origin Validation

For unsafe methods:

- Validate `Origin` or `Referer`.
- Allow only:
  - same-origin app URL
  - configured LAN origins
- Reject unknown origins.

## 8.5 Security Warning Text

When enabling LAN mode, show:

```text
LAN mode lets other devices on your network reach MediaVault. Keep it enabled only on trusted networks. Login is required, but this is not designed for direct internet exposure.
```

---

# 9. Playback Design

## 9.1 Browser Playback Is The Main Remote Playback Path

For remote clients:

- Use `/api/library/{id}/stream`.
- Keep native video player initially.
- Add better controls later if desired.
- No transcoding in this feature.

Limitations:

- Browser support depends on codec/container.
- MP4/H.264 is most likely to work.
- MKV/AVI may not play in browser.
- Do not silently transcode in the first auth/LAN feature.

## 9.2 Host VLC Action

Current endpoint:

```http
POST /api/library/{id}/open-vlc
```

Keep it, but restrict it.

Allowed only when:

- authenticated
- role is owner/admin
- request is from host/loopback
- VLC path configured
- media file exists

Remote behavior:

- Return `403` with message:

```json
{
  "error": "VLC launch is only available from the host PC."
}
```

Frontend behavior:

- On host: show `Open in VLC`.
- On remote device: hide or disable with tooltip.
- Do not make remote users think VLC opens on their own PC.

## 9.3 Reveal In Folder Action

Same rule as VLC.

Allowed only from host/loopback.

Remote behavior:

```json
{
  "error": "Reveal in folder is only available from the host PC."
}
```

## 9.4 Optional Future: Client VLC Via Signed Stream URL

Do not build this in the first pass.

Future design:

```http
POST /api/library/{id}/stream-token
```

Response:

```ts
type StreamTokenResponse = {
  url: string;
  expires_at: string;
};
```

Example:

```text
http://server-ip:5000/api/public-stream/<token>
```

Rules:

- Token expires in 5-15 minutes.
- Token is scoped to one media item.
- Token supports range requests.
- Token can be revoked.
- UI says: `Copy temporary stream URL for VLC`.

This is the correct future path if the user wants VLC on client PCs. Browser security does not let a normal web app launch arbitrary VLC on a remote client reliably.

---

# 10. Frontend Design Requirements

## 10.1 Routes

Add:

```text
/setup
/login
/security
```

Existing app routes remain:

```text
/
?tab=library
?tab=search
?tab=metadata
?tab=settings
/player/:id
```

## 10.2 Auth Provider

Add:

```text
app/web/src/features/auth/
├── auth-api.ts
├── auth-provider.tsx
├── login-page.tsx
├── setup-page.tsx
├── protected-route.tsx
├── security-page.tsx
└── csrf.ts
```

Responsibilities:

- Load auth status at startup.
- Redirect unauthenticated users.
- Keep current user in React state.
- Fetch CSRF token after login.
- Add `X-CSRF-Token` header for unsafe API calls.
- Handle 401 globally by redirecting to login.
- Handle 403 by showing permission/capability message.

## 10.3 API Client Changes

Update `app/web/src/lib/api.ts`.

Requirements:

- Always include credentials for fetch:

```ts
credentials: "same-origin"
```

- Add CSRF header on unsafe methods.
- Parse JSON error envelope.
- Handle non-JSON errors gracefully.
- Redirect or raise a typed error for 401/403.

## 10.4 Login Page UI

Design:

- Dark minimal full-screen page.
- App name/logo.
- Username.
- Password.
- Remember this device checkbox.
- Device label optional or auto-generated.
- Clear errors.
- No distracting media grid behind it.

Do not show the dashboard while unauthenticated.

## 10.5 Setup Page UI

Design:

- First-run owner account creation.
- Explain this is required before LAN access.
- Password and confirm password.
- Basic password strength hint.
- Create Owner button.

## 10.6 Security Settings UI

Add a security section under Settings or a dedicated page.

Sections:

1. Account
   - username
   - change password
   - logout

2. Sessions / Remembered Devices
   - current session
   - device label
   - last seen
   - expiry
   - revoke button

3. LAN Access
   - current bind mode
   - LAN enabled toggle
   - detected LAN URL
   - warning text
   - restart-required status if applicable

4. Capabilities
   - Browser playback available
   - VLC host action available/unavailable
   - Reveal folder available/unavailable

## 10.7 Player UI Capability Handling

Player should call:

```http
GET /api/system/capabilities
```

Then:

| Capability | UI Behavior |
|---|---|
| `browser_playback=true` | Show browser player |
| `open_vlc_on_host=true` | Show active Open in VLC button |
| `open_vlc_on_host=false` on remote | Show disabled/hidden VLC action with explanation |
| `reveal_file_on_host=false` on remote | Hide reveal action |
| `file_mutations=false` | Hide delete/move buttons |

---

# 11. Data Exposure Rules

## 11.1 File Paths

Currently `source_path` and `canonical_path` are returned in media APIs.

For owner-only MVP this is acceptable after login. For future viewer accounts:

- Hide raw paths from viewers.
- Show only filename and media metadata.
- Never show full local paths on login/setup pages.

## 11.2 Error Messages

Do not return raw internal errors directly to remote clients for sensitive operations.

Recommended error envelope:

```ts
type ApiError = {
  error: string;
  code?: string;
  request_id?: string;
};
```

Examples:

```json
{
  "error": "Media file is missing.",
  "code": "MEDIA_FILE_MISSING"
}
```

Avoid:

```json
{
  "error": "open C:\\Users\\Talal\\Videos\\Private\\file.mp4: access denied"
}
```

Internal logs can keep details later, but UI should receive safe messages.

---

# 12. Implementation Plan

## Phase 0: Preparation

- Cleanly identify all current routes.
- Add route grouping but do not change behavior yet.
- Add auth tables to DB initialization.
- Add tests for auth repository/service.

Deliverable:

- Existing app still works locally.
- Auth tables exist.

## Phase 1: First-Run Setup And Login

- Implement users table.
- Implement password hashing.
- Implement setup endpoint.
- Implement login/logout/status endpoints.
- Add frontend setup/login pages.
- Add auth provider and protected route.

Deliverable:

- App requires owner setup and login.

## Phase 2: Sessions, CSRF, And Middleware

- Implement server-side sessions.
- Add session cookie.
- Add CSRF token endpoint.
- Add CSRF middleware for unsafe methods.
- Add auth middleware to all existing routes.
- Add admin/owner middleware for mutations and file actions.

Deliverable:

- All current API routes are protected correctly.

## Phase 3: LAN Mode And Capabilities

- Add security settings endpoint.
- Add LAN mode config.
- Add capability endpoint.
- Add UI for LAN access.
- Disable host-only actions for remote clients.
- Add warnings and restart-required messaging.

Deliverable:

- App can safely run on LAN after login is configured.

## Phase 4: Playback Hardening

- Verify authenticated range streaming works in browser.
- Verify thumbnails/hover previews require auth.
- Handle 401/403 states in player.
- Add unavailable VLC UI state for remote devices.

Deliverable:

- Remote devices can stream in-browser after login.
- Remote devices cannot launch host VLC accidentally.

## Phase 5: Tests And Hardening

Backend tests:

- setup allowed only once
- password hashing/verification
- login success/failure
- session expiry
- logout revokes session
- CSRF blocks unsafe methods
- public routes remain public
- protected routes reject unauthenticated users
- admin routes reject non-admin users
- remote request cannot open VLC/reveal file

Frontend tests/manual checks:

- unauthenticated app redirects to login
- setup flow works
- login/logout works
- remembered session persists
- 401 redirects correctly
- remote capability disables VLC/reveal
- browser player loads stream after login

---

# 13. Agent Implementation Instructions

## 13.1 Do This

- Implement authentication before enabling LAN mode.
- Keep default bind host as `127.0.0.1`.
- Use HTTP-only cookies.
- Use server-side session storage.
- Protect all API routes except explicit public auth/health routes.
- Add CSRF for unsafe methods.
- Disable host-only actions for remote clients.
- Keep browser streaming as the remote playback path.
- Add clear UI messages for LAN/VLC limitations.
- Write focused tests.

## 13.2 Do Not Do This

- Do not expose the server to `0.0.0.0` by default.
- Do not use localStorage for auth tokens.
- Do not leave stream/thumbnail routes public.
- Do not use wildcard CORS.
- Do not allow remote clients to trigger host VLC.
- Do not allow remote clients to reveal host folders.
- Do not show raw file paths to unauthenticated users.
- Do not implement public internet access in this feature.
- Do not add heavy identity systems or OAuth.

---

# 14. Acceptance Criteria

The feature is done when:

- A fresh install forces owner setup.
- Existing installs without users force setup before accessing the app.
- User must log in before viewing library/media/settings.
- Session cookie is HTTP-only.
- Passwords are hashed with bcrypt.
- Unsafe API methods require CSRF.
- All existing media/file/settings routes require auth.
- Delete, move, scan, settings, VLC, reveal, metadata mutation routes require owner/admin.
- LAN mode cannot be enabled before setup.
- LAN mode is off by default.
- Browser playback works from a LAN client after login.
- VLC button is available on host only.
- Reveal folder is available on host only.
- Remote clients cannot launch server-host VLC.
- Logout revokes current session.
- User can view and revoke remembered sessions.
- Tests cover the security-critical paths.

---

# 15. Recommended Follow-Up Features

After this feature is stable, consider:

1. Missing-file/orphan detection.
2. Scan progress/history.
3. Structured logging with redaction.
4. Signed temporary stream URL for external players.
5. Viewer role for read-only LAN users.
6. Watch history/resume positions.
7. HTTPS/VPN guidance page.
8. Versioned DB migrations.
