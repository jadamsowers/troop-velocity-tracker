import React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import type { ThemePreference } from "./themeStorage";

const labels: Record<ThemePreference, string> = {
  light: "Light theme",
  dark: "Dark theme",
  system: "Match system",
};

export const ThemeToggle: React.FC = () => {
  const { preference, cyclePreference } = useTheme();

  const Icon =
    preference === "light" ? Sun : preference === "dark" ? Moon : Monitor;

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cyclePreference}
      title={`Theme: ${labels[preference]} (click to change)`}
      aria-label={`Theme: ${labels[preference]}. Click to cycle light, dark, or system.`}
    >
      <Icon size={20} strokeWidth={2} />
    </button>
  );
};
