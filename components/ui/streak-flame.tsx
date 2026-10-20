import { Flame } from "lucide-react";

import { cn } from "@/lib/utils";

export function StreakFlame({
  active = true,
  className,
}: {
  active?: boolean;
  className?: string;
}) {
  return (
    <Flame
      aria-hidden="true"
      className={cn(
        "size-5 shrink-0",
        active
          ? "club-streak-flame fill-orange-500/25 text-orange-600 dark:text-orange-400"
          : "text-muted-foreground",
        className,
      )}
    />
  );
}
