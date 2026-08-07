"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { LoadingModal } from "@/components/ui/loading-modal";

interface NavigationLoadingContextValue {
  hideNavigationLoading: () => void;
  showNavigationLoading: (description?: string) => void;
}

const NavigationLoadingContext = createContext<NavigationLoadingContextValue | null>(
  null,
);

interface NavigationLoadingProviderProps {
  children: React.ReactNode;
  delayMs?: number;
}

export function NavigationLoadingProvider({
  children,
  delayMs = 0,
}: NavigationLoadingProviderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [description, setDescription] = useState("");
  const timeoutRef = useRef<number | null>(null);
  const routeKey = `${pathname}?${searchParams.toString()}`;

  const clearPendingLoading = useCallback(() => {
    if (timeoutRef.current === null) {
      return;
    }

    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const hideNavigationLoading = useCallback(() => {
    clearPendingLoading();
    setDescription("");
  }, [clearPendingLoading]);

  const showNavigationLoading = useCallback(
    (nextDescription?: string) => {
      const resolvedDescription = nextDescription ?? "Cargando sección...";

      clearPendingLoading();

      if (delayMs <= 0) {
        setDescription(resolvedDescription);
        return;
      }

      setDescription("");
      timeoutRef.current = window.setTimeout(() => {
        setDescription(resolvedDescription);
        timeoutRef.current = null;
      }, delayMs);
    },
    [clearPendingLoading, delayMs],
  );

  useEffect(() => {
    hideNavigationLoading();
  }, [hideNavigationLoading, routeKey]);

  useEffect(() => hideNavigationLoading, [hideNavigationLoading]);

  useEffect(() => {
    if (!description) {
      return;
    }

    const timeout = window.setTimeout(() => setDescription(""), 15000);

    return () => window.clearTimeout(timeout);
  }, [description]);

  const value = useMemo<NavigationLoadingContextValue>(
    () => ({
      hideNavigationLoading,
      showNavigationLoading,
    }),
    [hideNavigationLoading, showNavigationLoading],
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
