import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { useTheme, type ThemeMode } from "../providers/theme-provider";

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  onOpenMobileNav: () => void;
  statusBadges: string[];
};

export function DashboardHeader({
  eyebrow,
  title,
  description,
  onOpenMobileNav,
  statusBadges,
}: Props) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <header className="surface-card relative overflow-hidden p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(224,178,92,0.16),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(78,120,171,0.14),transparent_28%)]" />
      <div className="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="page-kicker">{eyebrow}</div>
          <h1 className="brand-title mt-3 text-4xl leading-tight">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
            {description}
          </p>

          {statusBadges.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {statusBadges.map((entry) => (
                <Badge key={entry} variant="accent">
                  {entry}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onOpenMobileNav}
          >
            Menu
          </Button>

          <div className="surface-muted flex items-center gap-3 rounded-full px-4 py-2">
            <div className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
              Theme
            </div>
            <Select
              value={theme}
              onChange={(event) => setTheme(event.target.value as ThemeMode)}
              className="min-w-32 border-transparent bg-transparent pr-9 text-sm"
            >
              <option value="system">System</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </Select>
            <Badge variant="info">{resolvedTheme}</Badge>
          </div>
        </div>
      </div>
    </header>
  );
}
