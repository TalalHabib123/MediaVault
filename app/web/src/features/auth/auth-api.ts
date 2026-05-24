import { apiFetch } from "../../lib/api";
import type {
  AuthSession,
  AuthStatusResponse,
  AuthUser,
  SecuritySettings,
  SystemCapabilities,
} from "../../types";
import { setCsrfToken } from "./csrf";

type AuthResponse = {
  ok: boolean;
  user: AuthUser;
};

export async function getAuthStatus() {
  return apiFetch<AuthStatusResponse>("/api/auth/status");
}

export async function setupOwner(payload: {
  username: string;
  password: string;
  remember_device: boolean;
  device_label?: string;
}) {
  const response = await apiFetch<AuthResponse>("/api/auth/setup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  await refreshCsrfToken();
  return response;
}

export async function login(payload: {
  username: string;
  password: string;
  remember_device: boolean;
  device_label?: string;
}) {
  const response = await apiFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  await refreshCsrfToken();
  return response;
}

export async function logout() {
  return apiFetch<{ ok: boolean }>("/api/auth/logout", {
    method: "POST",
  });
}

export async function refreshCsrfToken() {
  const response = await apiFetch<{ csrf_token: string }>("/api/auth/csrf");
  setCsrfToken(response.csrf_token);
  return response.csrf_token;
}

export async function listSessions() {
  return apiFetch<{ sessions: AuthSession[] }>("/api/auth/sessions");
}

export async function revokeSession(id: number) {
  return apiFetch<{ ok: boolean }>(`/api/auth/sessions/${id}`, {
    method: "DELETE",
  });
}

export async function changePassword(payload: {
  current_password: string;
  new_password: string;
  revoke_other_sessions: boolean;
}) {
  return apiFetch<{ ok: boolean }>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSecuritySettings() {
  return apiFetch<SecuritySettings>("/api/settings/security");
}

export async function saveSecuritySettings(payload: SecuritySettings) {
  return apiFetch<{
    ok: boolean;
    security: SecuritySettings;
    restart_required: boolean;
  }>("/api/settings/security", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function getSystemCapabilities() {
  return apiFetch<SystemCapabilities>("/api/system/capabilities");
}
