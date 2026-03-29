import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type ThemePreference,
  getStoredTheme,
  resolveEffectiveTheme,
  setStoredTheme,
} from "./themeStorage";

type Ctx = {
  preference: ThemePreference;
  effective: "light" | "dark";
  setPreference: (p: ThemePreference) => void;
  cyclePreference: () => void;
};

const ThemeContext = createContext<Ctx | null>(null);

function applyDomTheme(effective: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", effective);
}

/** Call before React mounts to avoid flash of wrong theme */
export function initThemeFromStorage(): void {
  const stored = getStoredTheme();
  const pref = stored ?? "system";
  applyDomTheme(resolveEffectiveTheme(pref));
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    return getStoredTheme() ?? "system";
  });

  const effective = useMemo(
    () => resolveEffectiveTheme(preference),
    [preference],
  );

  useEffect(() => {
    applyDomTheme(effective);
  }, [effective]);

  useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyDomTheme(resolveEffectiveTheme("system"));
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    setStoredTheme(p);
    applyDomTheme(resolveEffectiveTheme(p));
  }, []);

  const cyclePreference = useCallback(() => {
    setPreferenceState((prev) => {
      const next: ThemePreference =
        prev === "light" ? "dark" : prev === "dark" ? "system" : "light";
      setStoredTheme(next);
      applyDomTheme(resolveEffectiveTheme(next));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      preference,
      effective,
      setPreference,
      cyclePreference,
    }),
    [preference, effective, setPreference, cyclePreference],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
