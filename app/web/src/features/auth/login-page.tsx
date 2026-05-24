import { useState, type FormEvent, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { useAuth } from "./auth-context";

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [deviceLabel, setDeviceLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!auth.loading && auth.setupRequired) {
    return <Navigate to="/setup" replace />;
  }

  if (!auth.loading && auth.authenticated) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      setSubmitting(true);
      setError("");
      await auth.login({
        username,
        password,
        remember_device: rememberDevice,
        device_label: deviceLabel,
      });
      const from = (location.state as { from?: { pathname?: string } } | null)
        ?.from;
      navigate(from?.pathname || "/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame kicker="Welcome Back" title="Sign in to MediaVault">
      <form onSubmit={onSubmit} className="grid gap-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}

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
            autoComplete="current-password"
          />
        </label>

        <label className="flex items-center gap-3 text-sm text-(--text-muted)">
          <input
            type="checkbox"
            checked={rememberDevice}
            onChange={(event) => setRememberDevice(event.target.checked)}
          />
          Remember this device
        </label>

        {rememberDevice ? (
          <label className="field-label">
            <span>Device Label</span>
            <Input
              value={deviceLabel}
              onChange={(event) => setDeviceLabel(event.target.value)}
              placeholder="Office laptop"
            />
          </label>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={submitting || !username.trim() || !password}
        >
          {submitting ? "Signing In..." : "Sign In"}
        </Button>
      </form>
    </AuthFrame>
  );
}

export function AuthFrame(props: {
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="app-frame flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md p-7">
        <div className="brand-mark">MV</div>
        <div className="page-kicker mt-6">{props.kicker}</div>
        <h1 className="brand-title mt-3 text-4xl leading-tight">
          {props.title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-(--text-muted)">
          Authentication protects local paths, streams, file actions, and LAN
          access.
        </p>
        <div className="mt-7">{props.children}</div>
      </Card>
    </div>
  );
}
