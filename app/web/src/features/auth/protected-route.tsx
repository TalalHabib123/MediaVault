import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth-context";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.loading) {
    return (
      <div className="app-frame flex min-h-screen items-center justify-center p-6">
        <div className="surface-card max-w-lg p-8 text-center">
          <div className="page-kicker">Security Check</div>
          <h1 className="brand-title mt-3 text-3xl">Loading MediaVault</h1>
          <p className="mt-3 text-sm text-(--text-muted)">
            Checking your session before opening the vault.
          </p>
        </div>
      </div>
    );
  }

  if (auth.setupRequired) {
    return <Navigate to="/setup" replace state={{ from: location }} />;
  }

  if (!auth.authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
