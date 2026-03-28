import { useMemo, useState, type ReactNode } from "react";
import { SidebarNav } from "./sidebar-nav";
import { DashboardHeader } from "./dashboard-header";
import type { TabKey } from "../../features/dashboard/dashboard-tabs";

type Props = {
  activeTab: TabKey;
  onTabChange: (nextTab: TabKey) => void;
  eyebrow: string;
  title: string;
  description: string;
  statusBadges: string[];
  alerts?: ReactNode;
  notifications?: ReactNode;
  children: ReactNode;
};

export function DashboardShell(props: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const statusBadges = useMemo(
    () => props.statusBadges.filter(Boolean),
    [props.statusBadges],
  );

  return (
    <div className="app-frame">
      <SidebarNav
        activeTab={props.activeTab}
        onTabChange={props.onTabChange}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="min-h-screen lg:pl-76">
        <div className="mx-auto flex min-h-screen max-w-360 flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <DashboardHeader
            eyebrow={props.eyebrow}
            title={props.title}
            description={props.description}
            onOpenMobileNav={() => setMobileOpen(true)}
            statusBadges={statusBadges}
          />

          {props.alerts}

          <main className="flex-1">{props.children}</main>
        </div>
      </div>

      {props.notifications}
    </div>
  );
}
