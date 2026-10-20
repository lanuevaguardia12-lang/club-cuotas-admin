import type { StandingClassificationStyle } from "@/lib/standings-classification";
import { cn } from "@/lib/utils";

export function StandingsLegend({
  classifications,
  className,
}: {
  classifications: StandingClassificationStyle[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-muted-foreground flex flex-wrap gap-1.5 text-[0.65rem] sm:text-xs",
        className,
      )}
    >
      {classifications.map((item) => (
        <span
          key={item.kind}
          className={cn("rounded-md px-2 py-1 font-medium", item.legendClassName)}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}
