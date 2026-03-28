export type TabKey = "library" | "search" | "metadata" | "settings";

export type DashboardTabMeta = {
  key: TabKey;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
};

export const DASHBOARD_TABS: DashboardTabMeta[] = [
  {
    key: "library",
    label: "Library",
    eyebrow: "Vault",
    title: "Library Control Room",
    description:
      "Scan, browse, move, and organize the media already discovered by MediaVault.",
  },
  {
    key: "search",
    label: "Search",
    eyebrow: "Discovery",
    title: "Tagged Search",
    description:
      "Filter tagged media by people, categories, series, and other metadata without leaving the vault.",
  },
  {
    key: "metadata",
    label: "Metadata",
    eyebrow: "Catalog",
    title: "Metadata Studio",
    description:
      "Create and manage the reusable metadata building blocks used across the library.",
  },
  {
    key: "settings",
    label: "Settings",
    eyebrow: "System",
    title: "Vault Settings",
    description:
      "Configure library roots, source folders, and external tools that power the local workflow.",
  },
];

export function parseDashboardTab(value: string | null): TabKey {
  if (value === "search" || value === "metadata" || value === "settings") {
    return value;
  }
  return "library";
}

export function getDashboardTabMeta(tab: TabKey) {
  return DASHBOARD_TABS.find((entry) => entry.key === tab) ?? DASHBOARD_TABS[0];
}
