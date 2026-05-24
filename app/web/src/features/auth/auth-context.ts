import { createContext, useContext } from "react";
import type { AuthStatusResponse, AuthUser } from "../../types";

export type AuthContextValue = {
  loading: boolean;
  setupRequired: boolean;
  authenticated: boolean;
  user: AuthUser | null;
  lanEnabled: boolean;
  reloadStatus: () => Promise<AuthStatusResponse | null>;
  login: (payload: {
    username: string;
    password: string;
    remember_device: boolean;
    device_label?: string;
  }) => Promise<void>;
  setup: (payload: {
    username: string;
    password: string;
    remember_device: boolean;
    device_label?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
