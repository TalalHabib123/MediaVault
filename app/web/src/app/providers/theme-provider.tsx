import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  applyTheme,
  getSystemTheme,
  ThemeContext,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemeMode,
} from "./theme-context";

export function ThemeProvider(props: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system";
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : "dark";
  });
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    getSystemTheme(),
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function syncTheme() {
      const nextResolved = theme === "system" ? getSystemTheme() : theme;
      setResolvedTheme(nextResolved);
      applyTheme(nextResolved);
    }

    syncTheme();
    mediaQuery.addEventListener("change", syncTheme);
    return () => mediaQuery.removeEventListener("change", syncTheme);
  }, [theme]);

  function setTheme(nextTheme: ThemeMode) {
    setThemeState(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
    }),
    [resolvedTheme, theme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {props.children}
    </ThemeContext.Provider>
  );
}
