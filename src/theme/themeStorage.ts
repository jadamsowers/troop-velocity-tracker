export type ThemePreference = "light" | "dark" | "system";

const KEY = "velocity_tracker_theme";

export function getStoredTheme(): ThemePreference | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function setStoredTheme(pref: ThemePreference): void {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* ignore */
  }
}

export function getSystemIsDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function resolveEffectiveTheme(
  pref: ThemePreference,
): "light" | "dark" {
  if (pref === "system") return getSystemIsDark() ? "dark" : "light";
  return pref;
}
