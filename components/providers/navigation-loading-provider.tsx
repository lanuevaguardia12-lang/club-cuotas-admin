"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { LoadingModal } from "@/components/ui/loading-modal";

interface NavigationLoadingContextValue {
  hideNavigationLoading: () => void;
  showNavigationLoading: (description?: string) => void;
}

const NavigationLoadingContext = createContext<NavigationLoadingContextValue | null>(
  null,
);

export function NavigationLoadingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [description, setDescription] = useState("");
  const routeKey = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    setDescription("");
  }, [routeKey]);

  useEffect(() => {
    if (!description) {
      return;
    }

    const timeout = window.setTimeout(() => setDescription(""), 15000);

    return () => window.clearTimeout(timeout);
  }, [description]);

  const value = useMemo<NavigationLoadingContextValue>(
    () => ({
      hideNavigationLoading: () => setDescription(""),
      showNavigationLoading: (nextDescription) =>
        setDescription(nextDescription ?? "Cargando sección..."),
    }),
    [],
  );

  return (
    <NavigationLoadingContext.Provider value={value}>
      <LoadingModal
        open={Boolean(description)}
        description={description || "Cargando sección..."}
      />
      {children}
    </NavigationLoadingContext.Provider>
  );
}

export function useNavigationLoading() {
  const context = useContext(NavigationLoadingContext);

  if (!context) {
    throw new Error(
      "useNavigationLoading debe usarse dentro de NavigationLoadingProvider.",
    );
  }

  return context;
}
