"use client";

import { ImageDown, Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";
import { cn } from "@/lib/utils";
import type { LeagueCompetitionKind, LeagueFixtureMatch } from "@/types/fixture";

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;
const POST_WIDTH = 1080;
const POST_HEIGHT = 1350;
const BRAND_LOGO_SRC = "/brand/escudo-la-nueva-guardia.png";

type NextMatchShareFormat = "story" | "post";

interface NextMatchShareButtonProps {
  className?: string;
  match: LeagueFixtureMatch;
  teamName: string;
}

export function NextMatchShareButton({
  className,
  match,
  teamName,
}: NextMatchShareButtonProps) {
  const [pendingFormat, setPendingFormat] = useState<NextMatchShareFormat | null>(null);
  const [message, setMessage] = useState("");
  const canShareNextMatch = match.status === "pending" && !match.involvesBye;

  async function handleShare(format: NextMatchShareFormat) {
    setPendingFormat(format);
    setMessage("");

    try {
      const blob = await createNextMatchBlob(match, format);
      const formatLabel = format === "story" ? "story" : "publicacion";
      const fileName = `proximo-partido-${formatLabel}-${slugify(getMatchRival(match, teamName))}.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          text: `Proximo partido: ${match.localTeam} vs ${match.visitorTeam}`,
          title: "Proximo partido",
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

  if (!canShareNextMatch) {
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

async function createNextMatchBlob(
  match: LeagueFixtureMatch,
  format: NextMatchShareFormat,
) {
  const canvas = document.createElement("canvas");

  canvas.width = format === "story" ? STORY_WIDTH : POST_WIDTH;
  canvas.height = format === "story" ? STORY_HEIGHT : POST_HEIGHT;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Tu navegador no pudo preparar la imagen.");
  }

  await drawNextMatchPlate(context, match, format);

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

async function drawNextMatchPlate(
  context: CanvasRenderingContext2D,
  match: LeagueFixtureMatch,
  format: NextMatchShareFormat,
) {
  const width = format === "story" ? STORY_WIDTH : POST_WIDTH;
  const height = format === "story" ? STORY_HEIGHT : POST_HEIGHT;
  const compact = format === "post";
  const logo = await loadImage(BRAND_LOGO_SRC).catch(() => undefined);

  drawBackground(context, width, height);

  if (logo) {
    drawContainedImage(
      context,
      logo,
      width / 2 - (compact ? 62 : 78),
      compact ? 72 : 112,
      compact ? 124 : 156,
      compact ? 114 : 142,
    );
  } else {
    drawFallbackLogo(context, width, compact ? 130 : 180);
  }

  drawCenteredText(context, "PROXIMO PARTIDO", width / 2, compact ? 284 : 382, {
    color: "#ffffff",
    font: compact
      ? "900 78px Impact, Arial Black, sans-serif"
      : "900 92px Impact, Arial Black, sans-serif",
    maxWidth: width - 120,
    shadowBlur: 24,
    shadowColor: "rgba(102,220,255,0.32)",
  });

  drawCenteredText(
    context,
    `${formatCompetition(match.competitionKind)} / ${formatMatchDate(match)}`,
    width / 2,
    compact ? 374 : 492,
    {
      color: "rgba(255,255,255,0.9)",
      font: compact ? "800 34px Arial, sans-serif" : "800 40px Arial, sans-serif",
      maxWidth: width - 140,
    },
  );

  drawTimePill(context, {
    compact,
    time: match.time || "Horario a confirmar",
    width,
    y: compact ? 422 : 552,
  });

  drawMatchup(context, {
    compact,
    localTeam: match.localTeam,
    visitorTeam: match.visitorTeam,
    width,
    y: compact ? 580 : 790,
  });

  drawCenteredText(
    context,
    "LA NUEVA GUARDIA",
    width / 2,
    height - (compact ? 78 : 108),
    {
      color: "rgba(255,255,255,0.72)",
      font: compact ? "800 30px Arial, sans-serif" : "800 34px Arial, sans-serif",
      letterSpacing: 10,
      maxWidth: width - 160,
    },
  );
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
    height * 0.64,
    80,
    width / 2,
    height * 0.64,
    680,
  );
  lowerGlow.addColorStop(0, "rgba(244,206,15,0.15)");
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

function drawTimePill(
  context: CanvasRenderingContext2D,
  {
    compact,
    time,
    width,
    y,
  }: {
    compact: boolean;
    time: string;
    width: number;
    y: number;
  },
) {
  const pillWidth = compact ? 380 : 430;
  const pillHeight = compact ? 68 : 78;
  const x = width / 2 - pillWidth / 2;

  context.save();
  context.fillStyle = "rgba(255,255,255,0.12)";
  context.strokeStyle = "rgba(244,206,15,0.62)";
  context.lineWidth = 3;
  roundedRect(context, x, y, pillWidth, pillHeight, pillHeight / 2);
  context.fill();
  context.stroke();
  context.restore();

  drawCenteredText(context, `${time} HS`, width / 2, y + (compact ? 45 : 52), {
    color: "#f4ce0f",
    font: compact ? "900 34px Arial Black, sans-serif" : "900 40px Arial Black, sans-serif",
    letterSpacing: 2,
  });
}

function drawMatchup(
  context: CanvasRenderingContext2D,
  {
    compact,
    localTeam,
    visitorTeam,
    width,
    y,
  }: {
    compact: boolean;
    localTeam: string;
    visitorTeam: string;
    width: number;
    y: number;
  },
) {
  const cardHeight = compact ? 520 : 650;
  const cardX = compact ? 74 : 82;
  const cardWidth = width - cardX * 2;
  const centerY = y + cardHeight / 2;

  context.save();
  const cardGradient = context.createLinearGradient(cardX, y, cardX + cardWidth, y + cardHeight);
  cardGradient.addColorStop(0, "rgba(255,255,255,0.16)");
  cardGradient.addColorStop(0.5, "rgba(0,148,220,0.18)");
  cardGradient.addColorStop(1, "rgba(255,255,255,0.08)");
  context.fillStyle = cardGradient;
  context.strokeStyle = "rgba(102,220,255,0.5)";
  context.lineWidth = 4;
  roundedRect(context, cardX, y, cardWidth, cardHeight, 34);
  context.fill();
  context.stroke();
  context.restore();

  drawTeamBlock(context, {
    align: "left",
    compact,
    label: localTeam,
    role: "Local",
    x: cardX + (compact ? 58 : 68),
    y: y + (compact ? 112 : 148),
  });

  drawTeamBlock(context, {
    align: "right",
    compact,
    label: visitorTeam,
    role: "Visita",
    x: cardX + cardWidth - (compact ? 58 : 68),
    y: y + (compact ? 112 : 148),
  });

  drawCenteredText(context, "VS", width / 2, centerY + (compact ? 28 : 36), {
    color: "#f4ce0f",
    font: compact
      ? "900 106px Arial Black, Impact, sans-serif"
      : "900 142px Arial Black, Impact, sans-serif",
    shadowBlur: 28,
    shadowColor: "rgba(244,206,15,0.22)",
  });
}

function drawTeamBlock(
  context: CanvasRenderingContext2D,
  {
    align,
    compact,
    label,
    role,
    x,
    y,
  }: {
    align: "left" | "right";
    compact: boolean;
    label: string;
    role: string;
    x: number;
    y: number;
  },
) {
  const maxWidth = compact ? 330 : 360;
  const fontSize = compact
    ? getTeamNameFontSize(label, 42)
    : getTeamNameFontSize(label, 48);
  const lineHeight = compact ? 48 : 56;
  const lines = getClampedLines(
    context,
    label.toUpperCase(),
    maxWidth,
    3,
    `900 ${fontSize}px Arial Black, sans-serif`,
  );

  context.save();
  context.textAlign = align;
  context.fillStyle = "#ffffff";
  context.font = `900 ${fontSize}px Arial Black, sans-serif`;
  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight, maxWidth);
  });

  context.fillStyle = "rgba(255,255,255,0.74)";
  context.font = compact ? "800 28px Arial, sans-serif" : "800 32px Arial, sans-serif";
  context.fillText(role, x, y + lineHeight * 3 + (compact ? 42 : 52), maxWidth);
  context.restore();
}

function drawFallbackLogo(
  context: CanvasRenderingContext2D,
  width: number,
  centerY: number,
) {
  context.save();
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(width / 2, centerY, 62, 0, Math.PI * 2);
  context.fill();
  drawCenteredText(context, "LNG", width / 2, centerY + 18, {
    color: "#012f77",
    font: "900 42px Arial Black, sans-serif",
  });
  context.restore();
}

function drawContainedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const ratio = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * ratio;
  const drawHeight = image.height * ratio;

  context.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
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

function getTeamNameFontSize(label: string, baseSize: number) {
  const length = label.replace(/\s+/g, "").length;

  if (length > 34) {
    return baseSize - 12;
  }

  if (length > 28) {
    return baseSize - 8;
  }

  if (length > 20) {
    return baseSize - 4;
  }

  return baseSize;
}

function getClampedLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  font: string,
) {
  context.save();
  context.font = font;
  const lines = wrapText(context, text, maxWidth).slice(0, maxLines);

  if (lines.length === maxLines) {
    const wrapped = wrapText(context, text, maxWidth);

    if (wrapped.length > maxLines) {
      lines[maxLines - 1] = fitTextWithEllipsis(context, lines[maxLines - 1], maxWidth);
    }
  }

  context.restore();

  return lines;
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

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  words.forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (context.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [text];
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

function formatMatchDate(match: LeagueFixtureMatch) {
  if (match.dateIso) {
    const date = new Date(`${match.dateIso}T12:00:00-03:00`);

    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("es-AR", {
        day: "numeric",
        month: "long",
        timeZone: "America/Argentina/Buenos_Aires",
        year: "numeric",
      }).format(date);
    }
  }

  return match.roundDate || "Fecha a definir";
}

function formatCompetition(kind: LeagueCompetitionKind) {
  const labels: Record<LeagueCompetitionKind, string> = {
    cup: "Copa",
    friendly: "Amistoso",
    league: "Liga",
  };

  return labels[kind] ?? "Partido";
}

function getMatchRival(match: LeagueFixtureMatch, teamName: string) {
  return match.localTeam === teamName ? match.visitorTeam : match.localTeam;
}

function isShareAbort(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.message.toLowerCase().includes("abort"))
  );
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
