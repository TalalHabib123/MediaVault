import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useAuth } from "./auth-context";
import { AuthFrame } from "./login-page";

export function SetupPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("owner");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!auth.loading && !auth.setupRequired && auth.authenticated) {
    return <Navigate to="/" replace />;
  }

  if (!auth.loading && !auth.setupRequired && !auth.authenticated) {
    return <Navigate to="/login" replace />;
  }

  const passwordTooShort = password.length > 0 && password.length < 10;
  const mismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      await auth.setup({
        username,
        password,
        remember_device: rememberDevice,
        device_label: "Owner browser",
      });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Owner setup failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame kicker="First Run" title="Create the owner account">
      <form onSubmit={onSubmit} className="grid gap-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Alert tone="info">
          Create this account before enabling LAN mode. It becomes the owner
          account for settings, scans, delete, move, VLC, and folder actions.
        </Alert>

        <label className="field-label">
          <span>Username</span>
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoFocus
          />
        </label>

        <label className="field-label">
          <span>Password</span>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
          <span className="text-xs normal-case tracking-normal text-(--text-muted)">
            Use at least 10 characters. No symbol gymnastics required.
          </span>
        </label>

        <label className="field-label">
          <span>Confirm Password</span>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
          />
        </label>

        {passwordTooShort ? (
          <Alert tone="warning">Password must be at least 10 characters.</Alert>
        ) : null}

        {mismatch ? <Alert tone="danger">Passwords do not match.</Alert> : null}

        <label className="flex items-center gap-3 text-sm text-(--text-muted)">
          <input
            type="checkbox"
            checked={rememberDevice}
            onChange={(event) => setRememberDevice(event.target.checked)}
          />
          Remember this device
        </label>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={
            submitting ||
            !username.trim() ||
            password.length < 10 ||
            password !== confirmPassword
          }
        >
          {submitting ? "Creating..." : "Create Owner"}
        </Button>
      </form>
    </AuthFrame>
  );
}
