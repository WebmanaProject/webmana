"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/** Reads/sets the `.dark` class on <html> and persists the choice. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("webmana-theme", next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  }

  return { theme, toggle };
}
