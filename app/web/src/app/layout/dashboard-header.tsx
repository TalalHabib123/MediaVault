import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { useTheme, type ThemeMode } from "../providers/theme-context";

type Props = {
  title: string;
  description: string;
  onOpenMobileNav: () => void;
  statusBadges: string[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  onScan: () => void;
  scanLoading: boolean;
  scanDisabled: boolean;
  onOpenFilters: () => void;
};

export function DashboardHeader({
  title,
  description,
  onOpenMobileNav,
  statusBadges,
  searchValue,
  onSearchChange,
  onScan,
  scanLoading,
  scanDisabled,
  onOpenFilters,
}: Props) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <header className="topbar">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={onOpenMobileNav}
          >
            Menu
          </Button>

          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-normal text-(--text-primary)">
              {title}
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-(--text-secondary)">
              {description}
            </p>
          </div>
        </div>

        {statusBadges.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {statusBadges.map((entry) => (
              <Badge key={entry} variant="accent">
                {entry}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <div className="topbar-actions">
        <label className="global-search">
          <span className="sr-only">Search everything</span>
          <Input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search everything..."
            className="min-h-11 border-transparent bg-transparent px-0 shadow-none"
          />
        </label>

        <Button
          variant="primary"
          onClick={onScan}
          disabled={scanLoading || scanDisabled}
          className="shrink-0"
        >
          {scanLoading ? "Scanning..." : "Scan"}
        </Button>

        <Button variant="secondary" onClick={onOpenFilters} className="shrink-0">
          Filters
        </Button>

        <div className="theme-control">
          <Select
            aria-label="Theme"
            value={theme}
            onChange={(event) => setTheme(event.target.value as ThemeMode)}
            className="min-h-10 border-transparent bg-transparent px-0 pr-7"
          >
            <option value="system">System</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </Select>
          <Badge variant="info">{resolvedTheme}</Badge>
        </div>
      </div>
    </header>
  );
}
