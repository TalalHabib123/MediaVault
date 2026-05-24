import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./features/auth/auth-provider";
import { LoginPage } from "./features/auth/login-page";
import { ProtectedRoute } from "./features/auth/protected-route";
import { SecurityPage } from "./features/auth/security-page";
import { SetupPage } from "./features/auth/setup-page";
import { DashboardPage } from "./features/dashboard/dashboard-page";
import { PlayerPage } from "./features/player/player-page";

export default function RootApp() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/player/:id"
            element={
              <ProtectedRoute>
                <PlayerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/security"
            element={
              <ProtectedRoute>
                <SecurityPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
