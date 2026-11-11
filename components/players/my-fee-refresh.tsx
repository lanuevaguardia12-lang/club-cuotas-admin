"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { refreshMyFeeFromFormsAction } from "@/app/(dashboard)/mi-cuota/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PULL_THRESHOLD = 82;
const MAX_PULL_DISTANCE = 128;
const FormsRefreshContext = createContext<ReturnType<typeof useFormsRefreshState> | null>(
  null,
);

export function MyFeeRefreshProvider({ children }: { children: ReactNode }) {
  const refresh = useFormsRefreshState();
  return (
    <FormsRefreshContext.Provider value={refresh}>
      {children}
    </FormsRefreshContext.Provider>
  );
}

export function MyFeePullToRefresh() {
  const { isRefreshing, message, refreshFromForms } = useFormsRefresh();
  const pullDistanceRef = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const canRelease = pullDistance >= PULL_THRESHOLD;

  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    function resetPull() {
      start = null;
      pullDistanceRef.current = 0;
      setPullDistance(0);
    }
    function handleTouchStart(event: TouchEvent) {
      const target = event.target;
      if (
        window.scrollY > 1 ||
        isRefreshing ||
        event.touches.length !== 1 ||
        (target instanceof Element &&
          target.closest('video, input, textarea, select, [role="dialog"]'))
      ) {
        resetPull();
        return;
      }
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY };
    }
    function handleTouchMove(event: TouchEvent) {
      if (!start || isRefreshing) return;
      const touch = event.touches[0];
      if (!touch || event.touches.length !== 1 || window.scrollY > 1) {
        resetPull();
        return;
      }
      const distance = touch.clientY - start.y;
      if (Math.abs(touch.clientX - start.x) > Math.abs(distance)) {
        resetPull();
        return;
      }
      const easedDistance = Math.min(MAX_PULL_DISTANCE, Math.max(0, distance) * 0.55);
      if (easedDistance > 0 && event.cancelable) event.preventDefault();
      setPullDistance(easedDistance);
      pullDistanceRef.current = easedDistance;
    }
    function handleTouchEnd() {
      const shouldRefresh = pullDistanceRef.current >= PULL_THRESHOLD;
      resetPull();
      if (shouldRefresh) void refreshFromForms();
    }
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", resetPull);
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", resetPull);
    };
  }, [isRefreshing, refreshFromForms]);

  if (!pullDistance && !isRefreshing && !message) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex justify-center px-4"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className="border-border bg-card text-card-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium shadow-lg transition-transform"
        style={{
          transform: `translateY(${isRefreshing || message ? 0 : Math.max(0, pullDistance - 42)}px)`,
        }}
      >
        <RefreshCw
          className={cn(
            "text-primary size-4 shrink-0",
            isRefreshing && "motion-safe:animate-spin",
          )}
          aria-hidden="true"
        />
        <span>
          {isRefreshing
            ? "Actualizando tu cuota..."
            : message ||
              (canRelease
                ? "Soltá para actualizar"
                : "Deslizá hacia abajo para actualizar")}
        </span>
      </div>
    </div>
  );
}

export function FormsRefreshButton({ className }: { className?: string }) {
  const { isRefreshing, refreshFromForms } = useFormsRefresh();
  const label = isRefreshing ? "Actualizando tu cuota..." : "Actualizar mi cuota";
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className={cn("size-9", className)}
      disabled={isRefreshing}
      aria-busy={isRefreshing}
      onClick={() => void refreshFromForms()}
      title={label}
      aria-label={label}
    >
      <RefreshCw
        className={isRefreshing ? "motion-safe:animate-spin" : undefined}
        aria-hidden="true"
      />
    </Button>
  );
}

function useFormsRefresh() {
  const refresh = useContext(FormsRefreshContext);
  if (!refresh)
    throw new Error("La actualización de cuota requiere MyFeeRefreshProvider.");
  return refresh;
}

function useFormsRefreshState() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const inFlightRef = useRef(false);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    },
    [],
  );

  const refreshFromForms = useCallback(async () => {
    if (inFlightRef.current || isPending) return;
    inFlightRef.current = true;
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    setMessage("");
    setIsRefreshing(true);
    try {
      const result = await refreshMyFeeFromFormsAction();
      setMessage(result.message);
      if (result.ok) startTransition(() => router.refresh());
    } catch {
      setMessage("No pudimos actualizar tu cuota. Volvé a intentarlo.");
    } finally {
      inFlightRef.current = false;
      setIsRefreshing(false);
      messageTimerRef.current = setTimeout(() => setMessage(""), 4500);
    }
  }, [isPending, router]);

  return { isRefreshing: isRefreshing || isPending, message, refreshFromForms };
}
