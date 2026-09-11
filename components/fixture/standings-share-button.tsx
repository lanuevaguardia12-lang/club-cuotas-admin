"use client";

import { ImageDown, Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";
import { drawFittedCrestImage } from "@/lib/crest-canvas";
import { getTeamCrestDataUrl, getTeamCrestFit } from "@/lib/team-profiles";
import { cn } from "@/lib/utils";
import type { LeagueStandingRow } from "@/types/fixture";
import type { TeamCrestFit, TeamProfile } from "@/types/teams";

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;
const POST_WIDTH = 1080;
const POST_HEIGHT = 1350;
const BRAND_LOGO_SRC = "/brand/escudo-la-nueva-guardia.png";
const STANDINGS_LEGEND_ITEMS: StandingClassificationStyle[] = [
  {
    badgeFill: "#f59e0b",
    label: "1° Campeón",
    legendFill: "#fef3c7",
    legendText: "#78350f",
    positions: [1],
    rowFill: "rgba(245,158,11,0.24)",
    rowStroke: "rgba(245,158,11,0.58)",
  },
  {
    badgeFill: "#0ea5e9",
    label: "2° Ascenso",
    legendFill: "#e0f2fe",
    legendText: "#075985",
    positions: [2],
    rowFill: "rgba(14,165,233,0.22)",
    rowStroke: "rgba(14,165,233,0.56)",
  },
  {
    badgeFill: "#8b5cf6",
    label: "3°/4° Promoción",
    legendFill: "#ede9fe",
    legendText: "#5b21b6",
    positions: [3, 4],
    rowFill: "rgba(139,92,246,0.22)",
    rowStroke: "rgba(139,92,246,0.56)",
  },
];

type StandingsShareFormat = "post" | "story";

interface StandingClassificationStyle {
  badgeFill: string;
  label: string;
  legendFill: string;
  legendText: string;
  positions: number[];
  rowFill: string;
  rowStroke: string;
}

interface LoadedTeamCrest {
  fit: TeamCrestFit;
  image?: HTMLImageElement;
  initials: string;
}

interface StandingsShareButtonProps {
  categoryName?: string;
  className?: string;
  competitionName?: string;
  rows: LeagueStandingRow[];
  teamName: string;
  teamProfiles?: TeamProfile[];
}

export function StandingsShareButton({
  categoryName,
  className,
  competitionName,
  rows,
  teamName,
  teamProfiles = [],
}: StandingsShareButtonProps) {
  const [pendingFormat, setPendingFormat] = useState<StandingsShareFormat | null>(null);
  const [message, setMessage] = useState("");

  async function handleShare(format: StandingsShareFormat) {
    setPendingFormat(format);
    setMessage("");

    try {
      const blob = await createStandingsBlob(rows, format, {
        categoryName,
        competitionName,
        teamName,
        teamProfiles,
      });
      const formatLabel = format === "story" ? "story" : "publicacion";
      const fileName = `tabla-posiciones-${formatLabel}.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          text: "Tabla de posiciones de La Nueva Guardia",
          title: "Tabla de posiciones",
        });
        setMessage("Placa lista para compartir.");
      } else {
        downloadBlob(blob, fileName);
        setMessage("Imagen descargada.");
      }
    } catch (error) {
      if (isShareAbort(error)) {
        return;
      }

      setMessage(error instanceof Error ? error.message : "No se pudo generar la placa.");
    } finally {
      setPendingFormat(null);
    }
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <LoadingModal
        open={Boolean(pendingFormat)}
        description={
          pendingFormat === "post" ? "Preparando publicacion..." : "Preparando story..."
        }
      />
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={Boolean(pendingFormat)}
          onClick={() => void handleShare("story")}
        >
          <Share2 />
          Story
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(pendingFormat)}
          onClick={() => void handleShare("post")}
        >
          <ImageDown />
          Publicacion
        </Button>
      </div>
      {message ? (
        <p className="text-muted-foreground text-center text-xs font-medium">{message}</p>
      ) : null}
    </div>
  );
}

async function createStandingsBlob(
  rows: LeagueStandingRow[],
  format: StandingsShareFormat,
  metadata: {
    categoryName?: string;
    competitionName?: string;
    teamName: string;
    teamProfiles: TeamProfile[];
  },
) {
  const canvas = document.createElement("canvas");

  canvas.width = format === "story" ? STORY_WIDTH : POST_WIDTH;
  canvas.height = format === "story" ? STORY_HEIGHT : POST_HEIGHT;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Tu navegador no pudo preparar la imagen.");
  }

  await drawStandingsPlate(context, rows, format, metadata);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("No se pudo exportar la imagen."));
      }
    }, "image/png");
  });
}

async function drawStandingsPlate(
  context: CanvasRenderingContext2D,
  rows: LeagueStandingRow[],
  format: StandingsShareFormat,
  {
    categoryName,
    competitionName,
    teamName,
    teamProfiles,
  }: {
    categoryName?: string;
    competitionName?: string;
    teamName: string;
    teamProfiles: TeamProfile[];
  },
) {
  const compact = format === "post";
  const width = compact ? POST_WIDTH : STORY_WIDTH;
  const height = compact ? POST_HEIGHT : STORY_HEIGHT;
  const logo = await loadTeamCrestImage(teamProfiles, teamName);
  const footerY = height - (compact ? 70 : 108);
  const tableY = compact ? 338 : 474;
  const tableX = compact ? 58 : 64;
  const tableWidth = width - tableX * 2;
  const legendY = footerY - (compact ? 86 : 124);
  const tableBottom = legendY - (compact ? 26 : 42);

  drawBackground(context, width, height);

  const logoSize = compact ? 118 : 136;
  drawTeamCrest(context, logo, width / 2 - logoSize / 2, compact ? 54 : 94, logoSize, {
    framed: false,
  });

  drawCenteredText(context, "TABLA DE POSICIONES", width / 2, compact ? 230 : 328, {
    color: "#ffffff",
    font: compact
      ? "900 68px Impact, Arial Black, sans-serif"
      : "900 76px Impact, Arial Black, sans-serif",
    maxWidth: width - 120,
    shadowBlur: 24,
    shadowColor: "rgba(102,220,255,0.34)",
  });

  const subtitle = [competitionName, categoryName].filter(Boolean).join(" / ");

  if (subtitle) {
    drawCenteredText(context, subtitle, width / 2, compact ? 286 : 392, {
      color: "rgba(255,255,255,0.84)",
      font: compact ? "800 28px Arial, sans-serif" : "800 34px Arial, sans-serif",
      maxWidth: width - 150,
    });
  }

  drawStandingsTable(context, {
    height: tableBottom - tableY,
    rows,
    tableX,
    tableY,
    tableWidth,
    teamName,
  });

  drawStandingsLegend(context, {
    compact,
    tableWidth,
    tableX,
    y: legendY,
  });

  drawCenteredText(context, "LA NUEVA GUARDIA", width / 2, footerY, {
    color: "rgba(255,255,255,0.72)",
    font: compact ? "800 30px Arial, sans-serif" : "800 34px Arial, sans-serif",
    letterSpacing: 0,
    maxWidth: width - 160,
  });
}

function drawStandingsTable(
  context: CanvasRenderingContext2D,
  {
    height,
    rows,
    tableX,
    tableY,
    tableWidth,
    teamName,
  }: {
    height: number;
    rows: LeagueStandingRow[];
    tableX: number;
    tableY: number;
    tableWidth: number;
    teamName: string;
  },
) {
  const headerHeight = 58;
  const rowHeight = Math.max(
    38,
    Math.min(64, Math.floor((height - headerHeight - 20) / Math.max(rows.length, 1))),
  );
  const tableHeight = headerHeight + rows.length * rowHeight + 18;

  context.save();
  const gradient = context.createLinearGradient(
    tableX,
    tableY,
    tableX + tableWidth,
    tableY + tableHeight,
  );
  gradient.addColorStop(0, "rgba(255,255,255,0.18)");
  gradient.addColorStop(0.5, "rgba(0,148,220,0.2)");
  gradient.addColorStop(1, "rgba(255,255,255,0.08)");
  context.fillStyle = gradient;
  context.strokeStyle = "rgba(102,220,255,0.5)";
  context.lineWidth = 4;
  roundedRect(context, tableX, tableY, tableWidth, tableHeight, 34);
  context.fill();
  context.stroke();
  context.restore();

  const columns = buildColumns(tableX, tableWidth);

  context.save();
  context.fillStyle = "rgba(2,9,22,0.5)";
  roundedRect(context, tableX + 16, tableY + 16, tableWidth - 32, headerHeight, 18);
  context.fill();
  context.restore();

  columns.forEach((column) => {
    drawTableText(context, column.label, column.x, tableY + 53, {
      align: column.align,
      color: "rgba(255,255,255,0.72)",
      font: "900 22px Arial, sans-serif",
      maxWidth: column.width,
    });
  });

  rows.forEach((row, index) => {
    const y = tableY + headerHeight + 18 + index * rowHeight;
    const isClub = row.isClub || areSameTeam(row.teamName, teamName);
    const classification = getStandingClassificationStyle(row.position);

    context.save();

    if (classification) {
      context.fillStyle = classification.rowFill;
      context.strokeStyle = classification.rowStroke;
      context.lineWidth = 2;
      roundedRect(context, tableX + 16, y, tableWidth - 32, rowHeight - 6, 16);
      context.fill();
      context.stroke();
    } else if (isClub) {
      context.fillStyle = "rgba(244,206,15,0.18)";
      context.strokeStyle = "#f4ce0f";
      context.lineWidth = 4;
      roundedRect(context, tableX + 16, y, tableWidth - 32, rowHeight - 6, 16);
      context.fill();
      context.stroke();
    } else if (index % 2 === 0) {
      context.fillStyle = "rgba(255,255,255,0.08)";
      roundedRect(context, tableX + 16, y, tableWidth - 32, rowHeight - 6, 16);
      context.fill();
    }

    if (isClub) {
      context.strokeStyle = "#f4ce0f";
      context.lineWidth = 4;
      roundedRect(context, tableX + 16, y, tableWidth - 32, rowHeight - 6, 16);
      context.stroke();
    }

    context.restore();

    drawPositionBadge(context, row.position, columns[0].x, y + rowHeight / 2 - 3, {
      classification,
      isClub,
    });
    drawTableText(
      context,
      fitTextWithEllipsis(context, row.teamName, columns[1].width),
      columns[1].x,
      y + rowHeight / 2 + 8,
      {
        align: "left",
        color: "#ffffff",
        font: isClub ? "900 27px Arial, sans-serif" : "800 25px Arial, sans-serif",
        maxWidth: columns[1].width,
      },
    );
    drawTableText(context, String(row.points), columns[2].x, y + rowHeight / 2 + 8, {
      align: "center",
      color: isClub ? "#f4ce0f" : "#ffffff",
      font: "900 28px Arial Black, sans-serif",
      maxWidth: columns[2].width,
    });
    drawStatCell(context, String(row.played), columns[3], y, rowHeight);
    drawStatCell(context, String(row.won), columns[4], y, rowHeight);
    drawStatCell(context, String(row.drawn), columns[5], y, rowHeight);
    drawStatCell(context, String(row.lost), columns[6], y, rowHeight);
    drawStatCell(
      context,
      row.goalDifference > 0 ? `+${row.goalDifference}` : String(row.goalDifference),
      columns[7],
      y,
      rowHeight,
    );
  });
}

function drawStandingsLegend(
  context: CanvasRenderingContext2D,
  {
    compact,
    tableWidth,
    tableX,
    y,
  }: {
    compact: boolean;
    tableWidth: number;
    tableX: number;
    y: number;
  },
) {
  const gap = compact ? 14 : 18;
  const pillHeight = compact ? 42 : 48;
  const swatchSize = compact ? 18 : 22;
  const horizontalPadding = compact ? 18 : 22;
  const font = compact ? "900 20px Arial, sans-serif" : "900 24px Arial, sans-serif";

  context.save();
  context.font = font;

  const itemWidths = STANDINGS_LEGEND_ITEMS.map(
    (item) =>
      Math.ceil(context.measureText(item.label).width) +
      horizontalPadding * 2 +
      swatchSize +
      12,
  );
  const totalWidth =
    itemWidths.reduce((total, itemWidth) => total + itemWidth, 0) +
    gap * Math.max(STANDINGS_LEGEND_ITEMS.length - 1, 0);
  let x = tableX + Math.max((tableWidth - totalWidth) / 2, 0);

  STANDINGS_LEGEND_ITEMS.forEach((item, index) => {
    const width = itemWidths[index] ?? 0;

    context.fillStyle = item.legendFill;
    context.strokeStyle = "rgba(255,255,255,0.26)";
    context.lineWidth = 2;
    roundedRect(context, x, y, width, pillHeight, 14);
    context.fill();
    context.stroke();

    context.fillStyle = item.badgeFill;
    roundedRect(
      context,
      x + horizontalPadding,
      y + (pillHeight - swatchSize) / 2,
      swatchSize,
      swatchSize,
      5,
    );
    context.fill();

    context.fillStyle = item.legendText;
    context.font = font;
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText(
      item.label,
      x + horizontalPadding + swatchSize + 12,
      y + pillHeight / 2 + 1,
    );

    x += width + gap;
  });

  context.restore();
}

function buildColumns(tableX: number, tableWidth: number) {
  const contentX = tableX + 34;
  const contentWidth = tableWidth - 68;
  const statWidth = 56;
  const positionWidth = 56;
  const pointsWidth = 70;
  const teamWidth = contentWidth - positionWidth - pointsWidth - statWidth * 5 - 16;
  const statsStart = contentX + positionWidth + teamWidth + pointsWidth + 16;

  return [
    { align: "center" as const, label: "#", width: positionWidth, x: contentX + 28 },
    {
      align: "left" as const,
      label: "Equipo",
      width: teamWidth,
      x: contentX + positionWidth,
    },
    {
      align: "center" as const,
      label: "PTS",
      width: pointsWidth,
      x: contentX + positionWidth + teamWidth + pointsWidth / 2,
    },
    { align: "center" as const, label: "PJ", width: statWidth, x: statsStart },
    {
      align: "center" as const,
      label: "G",
      width: statWidth,
      x: statsStart + statWidth,
    },
    {
      align: "center" as const,
      label: "E",
      width: statWidth,
      x: statsStart + statWidth * 2,
    },
    {
      align: "center" as const,
      label: "P",
      width: statWidth,
      x: statsStart + statWidth * 3,
    },
    {
      align: "center" as const,
      label: "DG",
      width: statWidth,
      x: statsStart + statWidth * 4,
    },
  ];
}

function drawPositionBadge(
  context: CanvasRenderingContext2D,
  position: number,
  x: number,
  centerY: number,
  {
    classification,
    isClub,
  }: {
    classification?: StandingClassificationStyle;
    isClub: boolean;
  },
) {
  const size = 38;

  context.save();
  context.fillStyle =
    classification?.badgeFill ?? (isClub ? "#f4ce0f" : "rgba(255,255,255,0.12)");
  context.strokeStyle = isClub ? "#f4ce0f" : "rgba(255,255,255,0.16)";
  context.lineWidth = isClub ? 4 : 2;
  roundedRect(context, x - size / 2, centerY - size / 2, size, size, 10);
  context.fill();
  context.stroke();
  context.fillStyle = classification || !isClub ? "#ffffff" : "#012f77";
  context.font = "900 21px Arial Black, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(position), x, centerY + 1, size - 6);
  context.restore();
}

function getStandingClassificationStyle(position: number) {
  return STANDINGS_LEGEND_ITEMS.find((item) => item.positions.includes(position));
}

function drawStatCell(
  context: CanvasRenderingContext2D,
  value: string,
  column: ReturnType<typeof buildColumns>[number],
  y: number,
  rowHeight: number,
) {
  drawTableText(context, value, column.x, y + rowHeight / 2 + 8, {
    align: "center",
    color: "rgba(255,255,255,0.9)",
    font: "800 23px Arial, sans-serif",
    maxWidth: column.width,
  });
}

function drawTableText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  {
    align,
    color,
    font,
    maxWidth,
  }: {
    align: CanvasTextAlign;
    color: string;
    font: string;
    maxWidth: number;
  },
) {
  context.save();
  context.fillStyle = color;
  context.font = font;
  context.textAlign = align;
  context.textBaseline = "alphabetic";
  context.fillText(text, x, y, maxWidth);
  context.restore();
}

function drawBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#06162f");
  gradient.addColorStop(0.42, "#012f77");
  gradient.addColorStop(1, "#020916");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(width / 2, 250, 20, width / 2, 250, 640);
  glow.addColorStop(0, "rgba(0,148,220,0.72)");
  glow.addColorStop(1, "rgba(0,148,220,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.save();
  context.strokeStyle = "rgba(102,220,255,0.12)";
  context.lineWidth = 2;
  for (let x = -height; x < width; x += 88) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + height * 0.6, height);
    context.stroke();
  }
  context.restore();

  context.save();
  context.strokeStyle = "rgba(102,220,255,0.36)";
  context.lineWidth = 3;
  roundedRect(context, 42, 42, width - 84, height - 84, 44);
  context.stroke();
  context.restore();
}

function drawCenteredText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  {
    color,
    font,
    letterSpacing = 0,
    maxWidth,
    shadowBlur = 0,
    shadowColor = "transparent",
  }: {
    color: string;
    font: string;
    letterSpacing?: number;
    maxWidth?: number;
    shadowBlur?: number;
    shadowColor?: string;
  },
) {
  context.save();
  context.fillStyle = color;
  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.shadowBlur = shadowBlur;
  context.shadowColor = shadowColor;

  if (letterSpacing > 0) {
    drawLetterSpacedText(context, text, x, y, letterSpacing);
  } else {
    context.fillText(text, x, y, maxWidth);
  }
  context.restore();
}

function drawLetterSpacedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  letterSpacing: number,
) {
  const characters = [...text];
  const width =
    characters.reduce(
      (total, character) => total + context.measureText(character).width,
      0,
    ) +
    letterSpacing * Math.max(characters.length - 1, 0);
  let currentX = x - width / 2;

  characters.forEach((character) => {
    context.fillText(character, currentX, y);
    currentX += context.measureText(character).width + letterSpacing;
  });
}

async function loadTeamCrestImage(
  teamProfiles: TeamProfile[],
  teamName: string,
): Promise<LoadedTeamCrest> {
  const fit = getTeamCrestFit(teamProfiles, teamName);
  const image = await loadImage(
    getTeamCrestDataUrl(teamProfiles, teamName) || BRAND_LOGO_SRC,
  ).catch(() => undefined);

  return {
    fit,
    image,
    initials: getTeamInitials(teamName),
  };
}

function drawTeamCrest(
  context: CanvasRenderingContext2D,
  crest: LoadedTeamCrest,
  x: number,
  y: number,
  size: number,
  options: { framed?: boolean } = {},
) {
  const framed = options.framed ?? true;
  const centerX = x + size / 2;
  const centerY = y + size / 2;

  if (framed) {
    context.save();
    context.shadowBlur = 18;
    context.shadowColor = "rgba(0,0,0,0.28)";
    context.fillStyle = "rgba(255,255,255,0.94)";
    context.beginPath();
    context.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  context.save();
  context.beginPath();
  context.arc(centerX, centerY, size / 2 - (framed ? 4 : 0), 0, Math.PI * 2);
  context.clip();

  if (crest.image) {
    const inset = framed ? size * 0.04 : 0;
    drawFittedCrestImage(
      context,
      crest.image,
      x + inset,
      y + inset,
      size - inset * 2,
      size - inset * 2,
      crest.fit,
    );
  } else {
    const gradient = context.createLinearGradient(x, y, x + size, y + size);
    gradient.addColorStop(0, "#eaf6ff");
    gradient.addColorStop(1, "#b7d7ff");
    context.fillStyle = gradient;
    context.fillRect(x, y, size, size);
    drawCenteredText(context, crest.initials || "LNG", centerX, centerY + size * 0.13, {
      color: "#013b8f",
      font: `900 ${Math.round(size * 0.28)}px Arial Black, sans-serif`,
      maxWidth: size * 0.7,
    });
  }

  context.restore();

  if (framed) {
    context.save();
    context.strokeStyle = "rgba(255,255,255,0.84)";
    context.lineWidth = 5;
    context.beginPath();
    context.arc(centerX, centerY, size / 2 - 2.5, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }
}

function getTeamInitials(teamName: string) {
  return teamName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function fitTextWithEllipsis(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const ellipsis = "...";

  if (context.measureText(text).width <= maxWidth) {
    return text;
  }

  let nextText = text;

  while (
    nextText.length > 0 &&
    context.measureText(`${nextText}${ellipsis}`).width > maxWidth
  ) {
    nextText = nextText.slice(0, -1).trim();
  }

  return nextText ? `${nextText}${ellipsis}` : ellipsis;
}

function areSameTeam(left: string, right: string) {
  return normalizeTeamName(left) === normalizeTeamName(right);
}

function normalizeTeamName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo cargar una imagen."));

    if (!source.startsWith("data:")) {
      image.crossOrigin = "anonymous";
    }

    image.src = source;
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function isShareAbort(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === "AbortError" || error.message.toLowerCase().includes("abort");
}
