import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import type {
  AuthSession,
  SecuritySettings,
  SystemCapabilities,
} from "../../types";
import {
  changePassword,
  getSecuritySettings,
  getSystemCapabilities,
  listSessions,
  revokeSession,
  saveSecuritySettings,
} from "./auth-api";
import { useAuth } from "./auth-context";

export function SecurityPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [security, setSecurity] = useState<SecuritySettings | null>(null);
  const [capabilities, setCapabilities] = useState<SystemCapabilities | null>(
    null,
  );
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);

  useEffect(() => {
    void loadSecurity();
  }, []);

  async function loadSecurity() {
    try {
      setError("");
      const [sessionData, securityData, capabilityData] = await Promise.all([
        listSessions(),
        getSecuritySettings(),
        getSystemCapabilities(),
      ]);
      setSessions(sessionData.sessions);
      setSecurity(securityData);
      setCapabilities(capabilityData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load security");
    }
  }

  async function onToggleLAN(nextValue: boolean) {
    if (!security) return;
    try {
      setSaving(true);
      setError("");
      setMessage("");
      const response = await saveSecuritySettings({
        ...security,
        lan_enabled: nextValue,
        bind_host: nextValue ? "0.0.0.0" : "127.0.0.1",
      });
      setSecurity(response.security);
      setRestartRequired(response.restart_required);
      setMessage(
        nextValue
          ? "LAN mode saved. Restart MediaVault when you are ready to bind on the LAN."
          : "Local mode saved. Restart MediaVault to bind only to localhost.",
      );
      await loadSecurity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save LAN mode");
    } finally {
      setSaving(false);
    }
  }

  async function onChangePassword(event: FormEvent) {
    event.preventDefault();
    try {
      setSaving(true);
      setError("");
      setMessage("");
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        revoke_other_sessions: true,
      });
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password changed and other sessions were revoked.");
      await loadSecurity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  async function onLogout() {
    await auth.logout();
    navigate("/login", { replace: true });
  }

  async function onRevokeSession(id: number) {
    try {
      setError("");
      await revokeSession(id);
      await loadSecurity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke session");
    }
  }

  return (
    <div className="app-frame min-h-screen">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="page-kicker">Security</div>
            <h1 className="brand-title mt-3 text-4xl">Account and LAN Access</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-(--text-muted)">
              Signed in as {auth.user?.username || "owner"}. LAN actions stay
              behind owner login and host-only capability checks.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => navigate("/")}>
              Dashboard
            </Button>
            <Button variant="outline" onClick={onLogout}>
              Logout
            </Button>
          </div>
        </div>

        {error ? <Alert tone="danger">{error}</Alert> : null}
        {message ? <Alert tone="success">{message}</Alert> : null}
        {restartRequired ? (
          <Alert tone="warning">
            A restart is required before the new bind mode takes effect.
          </Alert>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <CardHeader title="Account" description="Update the owner password." />
            <CardContent>
              <form onSubmit={onChangePassword} className="grid gap-4">
                <label className="field-label">
                  <span>Current Password</span>
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                </label>
                <label className="field-label">
                  <span>New Password</span>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                  />
                </label>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={
                    saving || !currentPassword || newPassword.length < 10
                  }
                >
                  Change Password
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="p-6">
            <CardHeader
              title="LAN Access"
              description="Choose local-only or trusted-network access."
            />
            <CardContent className="grid gap-4">
              <Alert tone="warning">
                LAN mode lets other devices on your network reach MediaVault.
                Keep it enabled only on trusted networks.
              </Alert>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={security?.lan_enabled ? "warning" : "success"}>
                  {security?.lan_enabled ? "LAN Mode" : "Local Mode"}
                </Badge>
                <Badge variant="info">{security?.bind_host || "127.0.0.1"}</Badge>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant={security?.lan_enabled ? "secondary" : "primary"}
                  disabled={saving || !security}
                  onClick={() => onToggleLAN(false)}
                >
                  Local
                </Button>
                <Button
                  variant={security?.lan_enabled ? "primary" : "secondary"}
                  disabled={saving || !security}
                  onClick={() => onToggleLAN(true)}
                >
                  LAN
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="p-6">
          <CardHeader
            title="Capabilities"
            description="Host-only actions are enabled only from localhost."
          />
          <CardContent className="grid gap-3 md:grid-cols-3">
            <CapabilityBadge
              label="Browser Playback"
              value={capabilities?.capabilities.browser_playback}
            />
            <CapabilityBadge
              label="Open VLC"
              value={capabilities?.capabilities.open_vlc_on_host}
            />
            <CapabilityBadge
              label="Reveal Folder"
              value={capabilities?.capabilities.reveal_file_on_host}
            />
          </CardContent>
        </Card>

        <Card className="p-6">
          <CardHeader
            title="Sessions"
            description="Remembered devices and active sessions."
          />
          <CardContent className="grid gap-3">
            {sessions.length === 0 ? (
              <div className="empty-state">No active sessions found.</div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className="surface-muted flex flex-col gap-3 rounded-[1.25rem] p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="font-semibold text-(--text-primary)">
                      {session.device_label || "MediaVault browser"}
                    </div>
                    <div className="mt-1 text-sm text-(--text-muted)">
                      Last seen {formatDate(session.last_seen_at)} from{" "}
                      {session.remote_addr || "unknown address"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {session.current ? <Badge variant="success">Current</Badge> : null}
                      {session.remember_device ? (
                        <Badge variant="info">Remembered</Badge>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    disabled={session.current}
                    onClick={() => onRevokeSession(session.id)}
                  >
                    Revoke
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CapabilityBadge(props: { label: string; value?: boolean }) {
  return (
    <div className="metric-card">
      <div className="page-kicker">{props.label}</div>
      <div className="mt-3">
        <Badge variant={props.value ? "success" : "warning"}>
          {props.value ? "Available" : "Unavailable"}
        </Badge>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
