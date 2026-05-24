export type TabKey =
  | "dashboard"
  | "library"
  | "movies"
  | "series"
  | "videos"
  | "search"
  | "metadata"
  | "scanner"
  | "bulk"
  | "settings";

export type DashboardTabMeta = {
  key: TabKey;
  label: string;
  description: string;
  group: "Library" | "Browse" | "Tools" | "System";
};

export const DASHBOARD_TABS: DashboardTabMeta[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    description: "Library health and recent media",
    group: "Library",
  },
  {
    key: "library",
    label: "All Videos",
    description: "Browse every indexed item",
    group: "Library",
  },
  {
    key: "movies",
    label: "Movies",
    description: "Movie records only",
    group: "Library",
  },
  {
    key: "series",
    label: "Series",
    description: "Episodes and season order",
    group: "Library",
  },
  {
    key: "videos",
    label: "General Videos",
    description: "Unclassified video records",
    group: "Library",
  },
  {
    key: "search",
    label: "Tagged Search",
    description: "Companies, people, categories, tags",
    group: "Browse",
  },
  {
    key: "metadata",
    label: "Metadata",
    description: "Manage reusable catalog terms",
    group: "Browse",
  },
  {
    key: "scanner",
    label: "Scanner",
    description: "Sources, scan status, previews",
    group: "Tools",
  },
  {
    key: "bulk",
    label: "Bulk Actions",
    description: "Review selected item operations",
    group: "Tools",
  },
  {
    key: "settings",
    label: "Settings",
    description: "Paths, cache, playback tools",
    group: "System",
  },
];

const validTabs = new Set(DASHBOARD_TABS.map((tab) => tab.key));

export function parseDashboardTab(value: string | null): TabKey {
  return validTabs.has(value as TabKey) ? (value as TabKey) : "dashboard";
}

export function getDashboardTabMeta(tab: TabKey) {
  return DASHBOARD_TABS.find((entry) => entry.key === tab) ?? DASHBOARD_TABS[0];
}

export function getLibraryMediaTypeForTab(tab: TabKey) {
  if (tab === "movies") return "movie";
  if (tab === "series") return "series_episode";
  if (tab === "videos") return "video";
  return null;
}
