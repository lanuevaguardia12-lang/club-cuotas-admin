"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { refreshMyFeeFromFormsAction } from "@/app/(dashboard)/mi-cuota/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PULL_THRESHOLD = 82;
const MAX_PULL_DISTANCE = 128;

export function MyFeePullToRefresh() {
  const { isRefreshing, message, refreshFromForms } = useFormsRefresh();
  const startYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const isPulling = pullDistance > 0;
  const canRelease = pullDistance >= PULL_THRESHOLD;

  useEffect(() => {
    function handleTouchStart(event: TouchEvent) {
      if (window.scrollY > 0 || isRefreshing) {
        startYRef.current = null;
        return;
      }

      startYRef.current = event.touches[0]?.clientY ?? null;
    }

    function handleTouchMove(event: TouchEvent) {
      if (startYRef.current === null || isRefreshing) {
        return;
      }

      const currentY = event.touches[0]?.clientY;

      if (currentY === undefined) {
        return;
      }

      const distance = Math.max(0, currentY - startYRef.current);

      if (distance <= 0) {
        setPullDistance(0);
        pullDistanceRef.current = 0;
        return;
      }

      if (window.scrollY <= 0) {
        event.preventDefault();
      }

      const easedDistance = Math.min(MAX_PULL_DISTANCE, distance * 0.55);
      setPullDistance(easedDistance);
      pullDistanceRef.current = easedDistance;
    }

    function handleTouchEnd() {
      const shouldRefresh = pullDistanceRef.current >= PULL_THRESHOLD;

      startYRef.current = null;
      pullDistanceRef.current = 0;
      setPullDistance(0);

      if (shouldRefresh) {
        void refreshFromForms();
      }
    }

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [isRefreshing, refreshFromForms]);

  if (!isPulling && !isRefreshing && !message) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex justify-center px-4">
      <div
        className={cn(
          "border-border bg-card text-card-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium shadow-lg transition-transform",
          isRefreshing || message ? "translate-y-0" : undefined,
        )}
        style={{
          transform:
            isRefreshing || message
              ? "translateY(0)"
              : `translateY(${Math.max(0, pullDistance - 42)}px)`,
        }}
      >
        <RefreshCw
          className={cn(
            "text-primary size-4",
            isRefreshing ? "animate-spin" : canRelease ? "club-animate-select-pop" : "",
          )}
          aria-hidden="true"
        />
        <span>
          {isRefreshing
            ? "Buscando pago en Forms..."
            : message ||
              (canRelease ? "Soltá para buscar el pago" : "Tirá para buscar en Forms")}
        </span>
      </div>
    </div>
  );
}

export function FormsRefreshButton({ className }: { className?: string }) {
  const { isRefreshing, refreshFromForms } = useFormsRefresh();
  const label = isRefreshing ? "Buscando pago en Forms..." : "Buscar pago en Forms";

  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className={cn("size-9", className)}
      disabled={isRefreshing}
      onClick={() => void refreshFromForms()}
      title={label}
      aria-label={label}
    >
      <RefreshCw className={isRefreshing ? "animate-spin" : undefined} />
      <span className="sr-only">{label}</span>
    </Button>
  );
}

function useFormsRefresh() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function refreshFromForms() {
    if (isRefreshing) {
      return;
    }

    setMessage("");
    setIsRefreshing(true);

    try {
      const result = await refreshMyFeeFromFormsAction();

      setMessage(result.message);

      if (result.ok) {
        startTransition(() => {
          router.refresh();
        });
      }

      window.setTimeout(() => setMessage(""), 2400);
    } finally {
      setIsRefreshing(false);
    }
  }

  return {
    isRefreshing: isRefreshing || isPending,
    message,
    refreshFromForms,
  };
}
