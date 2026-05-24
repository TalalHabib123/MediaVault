import { cn } from "../../lib/utils";
import {
  DASHBOARD_TABS,
  type DashboardTabMeta,
  type TabKey,
} from "../../features/dashboard/dashboard-tabs";

type Props = {
  activeTab: TabKey;
  onTabChange: (nextTab: TabKey) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  scanRunning?: boolean;
};

export function SidebarNav({
  activeTab,
  onTabChange,
  mobileOpen,
  onCloseMobile,
  scanRunning = false,
}: Props) {
  const groupedTabs = DASHBOARD_TABS.reduce(
    (groups, tab) => {
      groups[tab.group].push(tab);
      return groups;
    },
    {
      Library: [] as DashboardTabMeta[],
      Browse: [] as DashboardTabMeta[],
      Tools: [] as DashboardTabMeta[],
      System: [] as DashboardTabMeta[],
    },
  );

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation"
        className={cn(
          "fixed inset-0 z-40 bg-black/55 backdrop-blur-sm transition lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onCloseMobile}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-76 flex-col border-r border-(--border-strong) bg-(--sidebar-bg) px-5 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] transition-transform duration-300 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-start justify-between lg:block">
          <div>
            <div className="brand-mark">MV</div>
            <div className="mt-4">
              <div className="brand-title text-2xl">MediaVault</div>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-(--border-soft) bg-(--surface-2) px-3 py-1.5 text-xs text-(--text-secondary)">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    scanRunning ? "bg-(--warning)" : "bg-(--success)",
                  )}
                />
                {scanRunning ? "Scan running" : "Local vault ready"}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-icon lg:hidden"
            onClick={onCloseMobile}
          >
            Close
          </button>
        </div>

        <nav className="mt-7 grid gap-6 overflow-y-auto pr-1">
          {Object.entries(groupedTabs).map(([group, tabs]) => (
            <div key={group} className="grid gap-2">
              <div className="sidebar-group-label">{group}</div>
              {tabs.map((tab) => {
                const active = tab.key === activeTab;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      onTabChange(tab.key);
                      onCloseMobile();
                    }}
                    className={cn(
                      "sidebar-link text-left",
                      active && "sidebar-link-active",
                    )}
                  >
                    <span className="block text-sm font-semibold">
                      {tab.label}
                    </span>
                    <span className="mt-1 block text-xs text-(--text-muted)">
                      {tab.description}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mt-auto pt-8">
          <a className="sidebar-link block" href="/security">
            <div className="flex items-start gap-3">
              <span className="sidebar-link-index">SEC</span>
              <span>
                <span className="block text-sm font-semibold">Security</span>
                <span className="mt-1 block text-xs text-(--text-muted)">
                  Account and LAN access
                </span>
              </span>
            </div>
          </a>
        </div>
      </aside>
    </>
  );
}
