import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LeagueCompetitionKind } from "@/types/fixture";

const competitionMeta: Record<
  LeagueCompetitionKind,
  {
    badgeClassName: string;
    cardClassName: string;
    label: string;
  }
> = {
  cup: {
    badgeClassName:
      "border-[#f4ce0f]/50 bg-[#f4ce0f]/20 text-[#725d00] dark:text-[#f4ce0f]",
    cardClassName:
      "border-[#f4ce0f]/45 bg-[#fff7cc]/50 shadow-[inset_3px_0_0_rgba(244,206,15,0.95)] dark:bg-[#463c04]/25",
    label: "🏆 Copa",
  },
  friendly: {
    badgeClassName:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
    cardClassName:
      "border-emerald-200 bg-emerald-50/50 shadow-[inset_3px_0_0_rgba(5,150,105,0.75)] dark:border-emerald-900 dark:bg-emerald-950/25",
    label: "🤝 Amistoso",
  },
  league: {
    badgeClassName:
      "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
    cardClassName:
      "border-sky-200 bg-sky-50/45 shadow-[inset_3px_0_0_rgba(14,165,233,0.7)] dark:border-sky-900 dark:bg-sky-950/20",
    label: "⚽ Liga",
  },
};

interface CompetitionBadgeProps {
  className?: string;
  kind: LeagueCompetitionKind;
}

export function CompetitionBadge({ className, kind }: CompetitionBadgeProps) {
  return (
    <Badge className={cn("w-fit", competitionMeta[kind].badgeClassName, className)}>
      {competitionMeta[kind].label}
    </Badge>
  );
}

export function getCompetitionCardClass(kind: LeagueCompetitionKind) {
  return competitionMeta[kind].cardClassName;
}
