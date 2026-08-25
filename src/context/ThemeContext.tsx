/**
 * src/context/ThemeContext.tsx
 * Arca — Apple HIG準拠のテーマ管理 Context & Hook
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export type ThemeMode = "ivory" | "dark" | "sand" | "sage" | "system";
export type ResolvedTheme = "ivory" | "dark" | "sand" | "sage";

export interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (mode: ThemeMode) => void;
  isDark: boolean;
}

const STORAGE_KEY = "arca_theme";

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "ivory";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "ivory";
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") {
    return getSystemTheme();
  }
  return mode;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system";
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (saved && ["ivory", "dark", "sand", "sage", "system"].includes(saved)) {
        return saved;
      }
    } catch {
      // ignore
    }
    return "system";
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(theme));

  // テーマ適用ヘルパー
  const applyTheme = useCallback((activeResolved: ResolvedTheme) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;

    root.setAttribute("data-theme", activeResolved);

    // Tailwind CSS および汎用ダーク判定用
    if (activeResolved === "dark" || activeResolved === "sage") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    // PWA ステータスバー / theme-color の適応
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      if (activeResolved === "dark") metaThemeColor.setAttribute("content", "#0D0E12");
      else if (activeResolved === "sage") metaThemeColor.setAttribute("content", "#101715");
      else if (activeResolved === "sand") metaThemeColor.setAttribute("content", "#F5EFE6");
      else metaThemeColor.setAttribute("content", "#FAF8F5");
    }
  }, []);

  const setTheme = useCallback(
    (newTheme: ThemeMode) => {
      setThemeState(newTheme);
      try {
        localStorage.setItem(STORAGE_KEY, newTheme);
      } catch (err) {
        console.warn("Failed to persist theme to localStorage:", err);
      }

      const activeResolved = resolveTheme(newTheme);
      setResolvedTheme(activeResolved);
      applyTheme(activeResolved);
    },
    [applyTheme]
  );

  // システムのカラーテーマ変更リスナー
  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

    const handleChange = () => {
      if (theme === "system") {
        const newResolved = getSystemTheme();
        setResolvedTheme(newResolved);
        applyTheme(newResolved);
      }
    };

    // 初期適用
    const currentResolved = resolveTheme(theme);
    setResolvedTheme(currentResolved);
    applyTheme(currentResolved);

    if (mediaQuery && mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme, applyTheme]);

  const isDark = resolvedTheme === "dark" || resolvedTheme === "sage";

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
