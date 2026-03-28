import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DashboardPage } from "./features/dashboard/dashboard-page";
import { PlayerPage } from "./features/player/player-page";

export default function RootApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/player/:id" element={<PlayerPage />} />
      </Routes>
    </BrowserRouter>
  );
}
