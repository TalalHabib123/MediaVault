import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthStatusResponse } from "../../types";
import {
  getAuthStatus,
  login as loginRequest,
  logout as logoutRequest,
  refreshCsrfToken,
  setupOwner,
} from "./auth-api";
import { AuthContext, type AuthContextValue } from "./auth-context";
import { clearCsrfToken } from "./csrf";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<AuthStatusResponse>({
    setup_required: false,
    authenticated: false,
    user: null,
    lan_enabled: false,
  });

  const reloadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const nextStatus = await getAuthStatus();
      setStatus(nextStatus);
      if (nextStatus.authenticated) {
        await refreshCsrfToken();
      } else {
        clearCsrfToken();
      }
      return nextStatus;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadStatus();
  }, [reloadStatus]);

  useEffect(() => {
    function handleUnauthorized() {
      clearCsrfToken();
      setStatus((current) => ({
        ...current,
        authenticated: false,
        user: null,
      }));
    }

    window.addEventListener("mediavault:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("mediavault:unauthorized", handleUnauthorized);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      setupRequired: status.setup_required,
      authenticated: status.authenticated,
      user: status.user,
      lanEnabled: status.lan_enabled,
      reloadStatus,
      async login(payload) {
        const response = await loginRequest(payload);
        setStatus((current) => ({
          ...current,
          setup_required: false,
          authenticated: true,
          user: response.user,
        }));
      },
      async setup(payload) {
        const response = await setupOwner(payload);
        setStatus((current) => ({
          ...current,
          setup_required: false,
          authenticated: true,
          user: response.user,
        }));
      },
      async logout() {
        try {
          await logoutRequest();
        } finally {
          clearCsrfToken();
          setStatus((current) => ({
            ...current,
            authenticated: false,
            user: null,
          }));
        }
      },
    }),
    [loading, reloadStatus, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
