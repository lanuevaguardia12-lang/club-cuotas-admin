"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { useNavigationLoading } from "@/components/providers/navigation-loading-provider";

export function useLoadingRouter() {
  const router = useRouter();
  const { showNavigationLoading } = useNavigationLoading();
  const [, startTransition] = useTransition();

  function push(href: string, description = "Cargando sección...") {
    showNavigationLoading(description);
    startTransition(() => router.push(href));
  }

  function replace(href: string, description = "Cargando sección...") {
    showNavigationLoading(description);
    startTransition(() => router.replace(href));
  }

  return {
    push,
    replace,
    refresh: router.refresh,
  };
}
