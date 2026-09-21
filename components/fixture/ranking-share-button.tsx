"use client";

import { ImageDown, Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";
import { drawFittedCrestImage } from "@/lib/crest-canvas";
import { getTeamCrestDataUrl, getTeamCrestFit } from "@/lib/team-profiles";
import { cn } from "@/lib/utils";
import type { TeamCrestFit, TeamProfile } from "@/types/teams";

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;
const POST_WIDTH = 1080;
const POST_HEIGHT = 1350;
const BRAND_LOGO_SRC = "/brand/escudo-la-nueva-guardia.png";
const MAX_EXPORT_ROWS = 10;

type RankingShareFormat = "post" | "story";

export interface RankingShareRow {
  highlight?: boolean;
  id: string;
  position: number;
  primary: string;
  secondary?: string;
  value: number | string;
}

interface LoadedTeamCrest {
  fit: TeamCrestFit;
  image?: HTMLImageElement;
  initials: string;
}

interface RankingShareButtonProps {
  className?: string;
  filePrefix: string;
  primaryLabel: string;
  rows: RankingShareRow[];
  secondaryLabel?: string;
  shareText: string;
  shareTitle: string;
  subtitle?: string;
  teamName: string;
  teamProfiles?: TeamProfile[];
  title: string;
  valueLabel: string;
}

export function RankingShareButton({
  className,
  filePrefix,
  primaryLabel,
  rows,
  secondaryLabel,
  shareText,
  shareTitle,
  subtitle,
  teamName,
  teamProfiles = [],
  title,
  valueLabel,
}: RankingShareButtonProps) {
  const [pendingFormat, setPendingFormat] = useState<RankingShareFormat | null>(null);
  const [message, setMessage] = useState("");
  const exportRows = rows.slice(0, MAX_EXPORT_ROWS);

  async function handleShare(format: RankingShareFormat) {
    setPendingFormat(format);
    setMessage("");

    try {
      const blob = await createRankingBlob(exportRows, format, {
        primaryLabel,
        secondaryLabel,
        subtitle,
        teamName,
        teamProfiles,
        title,
        valueLabel,
      });
      const formatLabel = format === "story" ? "story" : "publicacion";
      const fileName = `${filePrefix}-${formatLabel}.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          text: shareText,
          title: shareTitle,
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

  if (exportRows.length === 0) {
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

async function createRankingBlob(
  rows: RankingShareRow[],
  format: RankingShareFormat,
  metadata: {
    primaryLabel: string;
    secondaryLabel?: string;
    subtitle?: string;
    teamName: string;
    teamProfiles: TeamProfile[];
    title: string;
    valueLabel: string;
  },
) {
  const canvas = document.createElement("canvas");
  const compact = format === "post";

  canvas.width = compact ? POST_WIDTH : STORY_WIDTH;
  canvas.height = compact ? POST_HEIGHT : STORY_HEIGHT;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Tu navegador no pudo preparar la imagen.");
  }

  await drawRankingPlate(context, rows, compact, metadata);

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

async function drawRankingPlate(
  context: CanvasRenderingContext2D,
  rows: RankingShareRow[],
  compact: boolean,
  {
    primaryLabel,
    secondaryLabel,
    subtitle,
    teamName,
    teamProfiles,
    title,
    valueLabel,
  }: {
    primaryLabel: string;
    secondaryLabel?: string;
    subtitle?: string;
    teamName: string;
    teamProfiles: TeamProfile[];
    title: string;
    valueLabel: string;
  },
) {
  const width = compact ? POST_WIDTH : STORY_WIDTH;
  const height = compact ? POST_HEIGHT : STORY_HEIGHT;
  const logo = await loadTeamCrestImage(teamProfiles, teamName);
  const footerY = height - (compact ? 70 : 108);
  const tableY = compact ? 338 : 486;
  const tableX = compact ? 58 : 64;
  const tableWidth = width - tableX * 2;
  const tableBottom = footerY - (compact ? 50 : 82);

  drawBackground(context, width, height);

  const logoSize = compact ? 118 : 136;
  drawTeamCrest(context, logo, width / 2 - logoSize / 2, compact ? 54 : 94, logoSize, {
    framed: false,
  });

  drawCenteredText(context, title.toUpperCase(), width / 2, compact ? 230 : 330, {
    color: "#ffffff",
    font: compact
      ? "900 72px Impact, Arial Black, sans-serif"
      : "900 82px Impact, Arial Black, sans-serif",
    maxWidth: width - 120,
    shadowBlur: 24,
    shadowColor: "rgba(102,220,255,0.34)",
  });

  if (subtitle) {
    drawCenteredText(context, subtitle, width / 2, compact ? 286 : 398, {
      color: "rgba(255,255,255,0.84)",
      font: compact ? "800 28px Arial, sans-serif" : "800 34px Arial, sans-serif",
      maxWidth: width - 150,
    });
  }

  drawRankingTable(context, {
    height: tableBottom - tableY,
    primaryLabel,
    rows,
    secondaryLabel,
    tableWidth,
    tableX,
    tableY,
    valueLabel,
  });

  drawCenteredText(context, "LA NUEVA GUARDIA", width / 2, footerY, {
    color: "rgba(255,255,255,0.72)",
    font: compact ? "800 30px Arial, sans-serif" : "800 34px Arial, sans-serif",
    letterSpacing: 0,
    maxWidth: width - 160,
  });
}

function drawRankingTable(
  context: CanvasRenderingContext2D,
  {
    height,
    primaryLabel,
    rows,
    secondaryLabel,
    tableWidth,
    tableX,
    tableY,
    valueLabel,
  }: {
    height: number;
    primaryLabel: string;
    rows: RankingShareRow[];
    secondaryLabel?: string;
    tableWidth: number;
    tableX: number;
    tableY: number;
    valueLabel: string;
  },
) {
  const headerHeight = 58;
  const rowHeight = Math.max(
    56,
    Math.min(82, Math.floor((height - headerHeight - 20) / Math.max(rows.length, 1))),
  );
  const tableHeight = headerHeight + rows.length * rowHeight + 18;
  const columns = buildColumns(tableX, tableWidth, Boolean(secondaryLabel));

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

  context.save();
  context.fillStyle = "rgba(2,9,22,0.5)";
  roundedRect(context, tableX + 16, tableY + 16, tableWidth - 32, headerHeight, 18);
  context.fill();
  context.restore();

  drawTableText(context, "#", columns.position.x, tableY + 53, {
    align: "center",
    color: "rgba(255,255,255,0.72)",
    font: "900 22px Arial, sans-serif",
    maxWidth: columns.position.width,
  });
  drawTableText(context, primaryLabel, columns.primary.x, tableY + 53, {
    align: "left",
    color: "rgba(255,255,255,0.72)",
    font: "900 22px Arial, sans-serif",
    maxWidth: columns.primary.width,
  });

  if (secondaryLabel && columns.secondary) {
    drawTableText(context, secondaryLabel, columns.secondary.x, tableY + 53, {
      align: "left",
      color: "rgba(255,255,255,0.72)",
      font: "900 22px Arial, sans-serif",
      maxWidth: columns.secondary.width,
    });
  }

  drawTableText(context, valueLabel, columns.value.x, tableY + 53, {
    align: "center",
    color: "rgba(255,255,255,0.72)",
    font: "900 22px Arial, sans-serif",
    maxWidth: columns.value.width,
  });

  rows.forEach((row, index) => {
    const y = tableY + headerHeight + 18 + index * rowHeight;

    context.save();
    if (row.highlight) {
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
    context.restore();

    drawRankingPosition(
      context,
      row.position,
      columns.position.x,
      y + rowHeight / 2 - 3,
      {
        highlight: Boolean(row.highlight),
      },
    );
    drawTableText(
      context,
      fitTextWithEllipsis(context, row.primary, columns.primary.width),
      columns.primary.x,
      y + rowHeight / 2 + 8,
      {
        align: "left",
        color: "#ffffff",
        font: row.highlight ? "900 26px Arial, sans-serif" : "800 25px Arial, sans-serif",
        maxWidth: columns.primary.width,
      },
    );

    if (columns.secondary) {
      drawTableText(
        context,
        fitTextWithEllipsis(context, row.secondary ?? "-", columns.secondary.width),
        columns.secondary.x,
        y + rowHeight / 2 + 8,
        {
          align: "left",
          color: row.highlight ? "#f4ce0f" : "rgba(255,255,255,0.88)",
          font: "800 23px Arial, sans-serif",
          maxWidth: columns.secondary.width,
        },
      );
    }

    drawTableText(context, String(row.value), columns.value.x, y + rowHeight / 2 + 9, {
      align: "center",
      color: row.highlight ? "#f4ce0f" : "#ffffff",
      font: "900 30px Arial Black, sans-serif",
      maxWidth: columns.value.width,
    });
  });
}

function buildColumns(tableX: number, tableWidth: number, hasSecondary: boolean) {
  const contentX = tableX + 34;
  const contentWidth = tableWidth - 68;
  const positionWidth = 56;
  const valueWidth = 94;
  const gap = 22;
  const remainingWidth = contentWidth - positionWidth - valueWidth - gap * 2;
  const secondaryWidth = hasSecondary ? Math.max(210, remainingWidth * 0.34) : 0;
  const primaryWidth = remainingWidth - secondaryWidth;
  const primaryX = contentX + positionWidth + gap;
  const secondaryX = primaryX + primaryWidth + gap;

  return {
    position: {
      width: positionWidth,
      x: contentX + positionWidth / 2,
    },
    primary: {
      width: primaryWidth,
      x: primaryX,
    },
    secondary: hasSecondary
      ? {
          width: secondaryWidth,
          x: secondaryX,
        }
      : undefined,
    value: {
      width: valueWidth,
      x: contentX + contentWidth - valueWidth / 2,
    },
  };
}

function drawRankingPosition(
  context: CanvasRenderingContext2D,
  position: number,
  x: number,
  centerY: number,
  { highlight }: { highlight: boolean },
) {
  const size = 38;

  context.save();
  context.fillStyle = highlight ? "#f4ce0f" : "rgba(255,255,255,0.12)";
  context.strokeStyle = highlight ? "#f4ce0f" : "rgba(255,255,255,0.16)";
  context.lineWidth = highlight ? 4 : 2;
  roundedRect(context, x - size / 2, centerY - size / 2, size, size, 10);
  context.fill();
  context.stroke();
  context.fillStyle = highlight ? "#012f77" : "#ffffff";
  context.font = "900 21px Arial Black, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(position), x, centerY + 1, size - 6);
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

  const lowerGlow = context.createRadialGradient(
    width / 2,
    height * 0.68,
    80,
    width / 2,
    height * 0.68,
    650,
  );
  lowerGlow.addColorStop(0, "rgba(244,206,15,0.16)");
  lowerGlow.addColorStop(1, "rgba(244,206,15,0)");
  context.fillStyle = lowerGlow;
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
