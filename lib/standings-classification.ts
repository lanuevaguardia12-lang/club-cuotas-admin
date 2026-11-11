import type { LeagueStandingRow } from "@/types/fixture";

export interface StandingClassificationStyle {
  kind:
    "champion" | "promotion" | "promotion-playoff" | "relegation-playoff" | "relegation";
  badgeFill: string;
  label: string;
  legendFill: string;
  legendText: string;
  positions: number[];
  rowFill: string;
  rowStroke: string;
  rowClassName: string;
  badgeClassName: string;
  legendClassName: string;
}

const TOP_CLASSIFICATIONS: StandingClassificationStyle[] = [
  {
    kind: "champion",
    badgeFill: "#f59e0b",
    label: "1° Campeón",
    legendFill: "#fef3c7",
    legendText: "#78350f",
    positions: [1],
    rowFill: "rgba(245,158,11,0.24)",
    rowStroke: "rgba(245,158,11,0.58)",
    rowClassName: "bg-amber-100/70 dark:bg-amber-950/30",
    badgeClassName: "bg-amber-500 text-white",
    legendClassName: "bg-amber-100 text-amber-900",
  },
  {
    kind: "promotion",
    badgeFill: "#0ea5e9",
    label: "2° Ascenso",
    legendFill: "#e0f2fe",
    legendText: "#075985",
    positions: [2],
    rowFill: "rgba(14,165,233,0.22)",
    rowStroke: "rgba(14,165,233,0.56)",
    rowClassName: "bg-sky-100/70 dark:bg-sky-950/30",
    badgeClassName: "bg-sky-500 text-white",
    legendClassName: "bg-sky-100 text-sky-900",
  },
  {
    kind: "promotion-playoff",
    badgeFill: "#8b5cf6",
    label: "3°/4° Promoción",
    legendFill: "#ede9fe",
    legendText: "#5b21b6",
    positions: [3, 4],
    rowFill: "rgba(139,92,246,0.22)",
    rowStroke: "rgba(139,92,246,0.56)",
    rowClassName: "bg-violet-100/70 dark:bg-violet-950/30",
    badgeClassName: "bg-violet-500 text-white",
    legendClassName: "bg-violet-100 text-violet-900",
  },
];

export function getStandingsClassifications(
  categoryName: string | undefined,
  rows: Pick<LeagueStandingRow, "position">[],
  competitionName = "",
): StandingClassificationStyle[] {
  const category = (categoryName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f"'“”‘’]/g, "")
    .trim()
    .toLowerCase();
  const competition = `${competitionName} ${category}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/\bcopa\b|play\s*off|semifinal|\bfinal\b|promocion/.test(competition)) {
    return [];
  }
  const positions = [...new Set(rows.map((row) => row.position))]
    .filter((position) => Number.isInteger(position) && position > 0)
    .sort((left, right) => left - right);

  const division = /^primera\s+([abc])\b/.exec(category)?.[1];
  if (!division) {
    return TOP_CLASSIFICATIONS;
  }

  const hasRelegation = division !== "c" && positions.length >= 4;
  const relegation = hasRelegation ? positions.slice(-2) : [];
  const playoff = hasRelegation ? positions.slice(-4, -2) : [];
  const relegationPositions = new Set([...relegation, ...playoff]);
  const availablePositions = new Set(positions);
  const ascentClassifications =
    division === "a"
      ? []
      : [
          { ...TOP_CLASSIFICATIONS[1], positions: [1, 2], label: "Ascenso directo" },
          { ...TOP_CLASSIFICATIONS[2], label: "Promoción" },
        ];
  const top = ascentClassifications
    .map((item) => {
      const selectedPositions = item.positions.filter(
        (position) =>
          availablePositions.has(position) && !relegationPositions.has(position),
      );
      return {
        ...item,
        positions: selectedPositions,
        label: `${selectedPositions.map((position) => `${position}°`).join("/")} ${item.label}`,
      };
    })
    .filter((item) => item.positions.length > 0);

  if (!hasRelegation) return top;
  return [
    ...top,
    {
      kind: "relegation-playoff",
      badgeFill: "#f97316",
      label: `${playoff.map((position) => `${position}°`).join("/")} Promoción`,
      legendFill: "#ffedd5",
      legendText: "#7c2d12",
      positions: playoff,
      rowFill: "rgba(249,115,22,0.24)",
      rowStroke: "rgba(249,115,22,0.68)",
      rowClassName: "bg-orange-100/80 dark:bg-orange-950/40",
      badgeClassName: "bg-orange-600 text-white",
      legendClassName: "bg-orange-100 text-orange-900",
    },
    {
      kind: "relegation",
      badgeFill: "#e11d48",
      label: `${relegation.map((position) => `${position}°`).join("/")} Descenso directo`,
      legendFill: "#ffe4e6",
      legendText: "#881337",
      positions: relegation,
      rowFill: "rgba(225,29,72,0.28)",
      rowStroke: "rgba(244,63,94,0.76)",
      rowClassName: "bg-rose-100/80 dark:bg-rose-950/40",
      badgeClassName: "bg-rose-600 text-white",
      legendClassName: "bg-rose-100 text-rose-900",
    },
  ];
}

export function getStandingClassificationStyle(
  position: number,
  classifications: StandingClassificationStyle[],
) {
  return classifications.find((item) => item.positions.includes(position));
}
