"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";

import { DEFAULT_APP_SETTINGS, getContrastingTextColor } from "@/lib/app-settings";
import type { AppSettings } from "@/types/settings";

interface AppSettingsContextValue {
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;
}

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function AppSettingsProvider({
  children,
  initialSettings,
}: Readonly<{
  children: React.ReactNode;
  initialSettings?: AppSettings;
}>) {
  const [settings, setSettings] = useState<AppSettings>(
    initialSettings ?? DEFAULT_APP_SETTINGS,
  );
  const { setTheme } = useTheme();

  useEffect(() => {
    setSettings(initialSettings ?? DEFAULT_APP_SETTINGS);
  }, [initialSettings]);

  useEffect(() => {
    const root = document.documentElement;

    root.style.setProperty("--primary", settings.primaryColor);
    root.style.setProperty("--ring", settings.primaryColor);
    root.style.setProperty(
      "--primary-foreground",
      getContrastingTextColor(settings.primaryColor),
    );
    setTheme(settings.darkMode ? "dark" : "light");
  }, [setTheme, settings.darkMode, settings.primaryColor]);

  const value = useMemo(
    () => ({
      settings,
      setSettings,
    }),
    [settings],
  );

  return (
    <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);

  if (!context) {
    return {
      settings: DEFAULT_APP_SETTINGS,
      setSettings: () => undefined,
    };
  }

  return context;
}
