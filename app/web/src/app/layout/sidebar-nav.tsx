import { cn } from "../../lib/utils";
import {
  DASHBOARD_TABS,
  type TabKey,
} from "../../features/dashboard/dashboard-tabs";

type Props = {
  activeTab: TabKey;
  onTabChange: (nextTab: TabKey) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

export function SidebarNav({
  activeTab,
  onTabChange,
  mobileOpen,
  onCloseMobile,
}: Props) {
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
        <div className="flex items-center justify-between lg:block">
          <div>
            <div className="brand-mark">MV</div>
            <div className="mt-4">
              <div className="brand-title text-2xl">MediaVault</div>
              <p className="mt-2 text-sm text-(--text-muted)">
                A polished local-first vault for long-form media and metadata
                control.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-icon lg:hidden"
            onClick={onCloseMobile}
          >
            X
          </button>
        </div>

        <nav className="mt-8 grid gap-2">
          {DASHBOARD_TABS.map((tab, index) => {
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
                <div className="flex items-start gap-3">
                  <span className="sidebar-link-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {tab.label}
                    </span>
                    <span className="mt-1 block text-xs text-(--text-muted)">
                      {tab.eyebrow}
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto pt-8">
          <div className="surface-muted rounded-[1.25rem] p-4">
            <div className="text-[11px] uppercase tracking-[0.28em] text-(--text-muted)">
              Design Mode
            </div>
            <div className="mt-2 text-sm text-(--text-primary)">
              Cinematic vault shell with theme-aware surfaces and reusable UI
              primitives.
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
