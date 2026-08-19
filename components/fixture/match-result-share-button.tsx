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

type ResultShareFormat = "story" | "post";

interface MatchResultShareButtonProps {
  className?: string;
  match: LeagueFixtureMatch;
  teamName: string;
}

export function MatchResultShareButton({
  className,
  match,
  teamName,
}: MatchResultShareButtonProps) {
  const [pendingFormat, setPendingFormat] = useState<ResultShareFormat | null>(null);
  const [message, setMessage] = useState("");
  const canShareResult =
    match.status === "played" &&
    typeof match.localScore === "number" &&
    typeof match.visitorScore === "number";

  async function handleShare(format: ResultShareFormat) {
    setPendingFormat(format);
    setMessage("");

    try {
      const result = getResultView(match, teamName);
      const blob = await createMatchResultBlob(match, teamName, format);
      const formatLabel = format === "story" ? "story" : "publicacion";
      const fileName = `resultado-${formatLabel}-${slugify(result.rivalName)}.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          text: `Resultado final: ${result.teamName} ${result.teamScore}-${result.rivalScore} ${result.rivalName}`,
          title: "Resultado final",
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

  if (!canShareResult) {
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

async function createMatchResultBlob(
  match: LeagueFixtureMatch,
  teamName: string,
  format: ResultShareFormat,
) {
  const canvas = document.createElement("canvas");

  canvas.width = format === "story" ? STORY_WIDTH : POST_WIDTH;
  canvas.height = format === "story" ? STORY_HEIGHT : POST_HEIGHT;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Tu navegador no pudo preparar la imagen.");
  }

  await drawMatchResultPlate(context, match, teamName, format);

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

async function drawMatchResultPlate(
  context: CanvasRenderingContext2D,
  match: LeagueFixtureMatch,
  teamName: string,
  format: ResultShareFormat,
) {
  const width = format === "story" ? STORY_WIDTH : POST_WIDTH;
  const height = format === "story" ? STORY_HEIGHT : POST_HEIGHT;
  const compact = format === "post";
  const logo = await loadImage(BRAND_LOGO_SRC).catch(() => undefined);
  const result = getResultView(match, teamName);
  const scorers = getTeamGoalScorers(match, teamName);

  drawBackground(context, width, height);

  if (logo) {
    drawContainedImage(
      context,
      logo,
      width / 2 - (compact ? 62 : 78),
      compact ? 82 : 112,
      compact ? 124 : 156,
      compact ? 114 : 142,
    );
  } else {
    drawFallbackLogo(context, width, compact ? 140 : 180);
  }

  drawCenteredText(context, "RESULTADO FINAL", width / 2, compact ? 300 : 386, {
    color: "#ffffff",
    font: compact
      ? "900 82px Impact, Arial Black, sans-serif"
      : "900 92px Impact, Arial Black, sans-serif",
    maxWidth: width - 130,
    shadowBlur: 24,
    shadowColor: "rgba(102,220,255,0.32)",
  });

  drawCenteredText(
    context,
    `${formatResultDate(match.dateIso)} / ${formatCompetition(match.competitionKind)}`,
    width / 2,
    compact ? 382 : 494,
    {
      color: "rgba(255,255,255,0.88)",
      font: compact ? "800 34px Arial, sans-serif" : "800 38px Arial, sans-serif",
      maxWidth: width - 150,
    },
  );

  drawWrappedCenteredText(
    context,
    `VS ${result.rivalName}`,
    width / 2,
    compact ? 452 : 586,
    width - 140,
    {
      color: "#f4ce0f",
      font: compact
        ? "900 42px Arial Black, Impact, sans-serif"
        : "900 48px Arial Black, Impact, sans-serif",
      lineHeight: compact ? 48 : 56,
      maxLines: 2,
      shadowBlur: 16,
      shadowColor: "rgba(244,206,15,0.22)",
      uppercase: true,
    },
  );

  drawScoreboard(context, {
    compact,
    result,
    width,
    y: compact ? 620 : 850,
  });

  if (scorers.length > 0) {
    drawScorersBlock(context, {
      compact,
      scorers,
      width,
      y: compact ? 970 : 1370,
    });
  }

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

  const glow = context.createRadialGradient(width / 2, 250, 20, width / 2, 250, 620);
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
  lowerGlow.addColorStop(0, "rgba(102,220,255,0.18)");
  lowerGlow.addColorStop(1, "rgba(102,220,255,0)");
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

function drawScoreboard(
  context: CanvasRenderingContext2D,
  {
    compact,
    result,
    width,
    y,
  }: {
    compact: boolean;
    result: ResultView;
    width: number;
    y: number;
  },
) {
  const cardHeight = compact ? 340 : 440;
  const hasPenalties =
    typeof result.teamPenaltyScore === "number" &&
    typeof result.rivalPenaltyScore === "number";
  const mainScoreY = hasPenalties ? y + (compact ? 236 : 304) : y + (compact ? 282 : 358);
  const penaltyScoreY = y + (compact ? 306 : 394);

  context.save();
  const cardGradient = context.createLinearGradient(90, y, width - 90, y + cardHeight);
  cardGradient.addColorStop(0, "rgba(255,255,255,0.16)");
  cardGradient.addColorStop(0.5, "rgba(0,148,220,0.18)");
  cardGradient.addColorStop(1, "rgba(255,255,255,0.08)");
  context.fillStyle = cardGradient;
  context.strokeStyle = "rgba(102,220,255,0.5)";
  context.lineWidth = 4;
  roundedRect(context, 90, y, width - 180, cardHeight, 34);
  context.fill();
  context.stroke();
  context.restore();

  drawTeamSide(context, {
    align: "left",
    compact,
    label: "LA NUEVA GUARDIA",
    role: result.teamRole,
    maxWidth: compact ? 270 : 310,
    x: 150,
    y: y + (compact ? 76 : 104),
  });

  drawTeamSide(context, {
    align: "right",
    compact,
    label: result.rivalName,
    role: result.rivalRole,
    maxWidth: compact ? 270 : 310,
    x: width - 150,
    y: y + (compact ? 76 : 104),
  });

  drawCenteredText(
    context,
    `${result.teamScore} - ${result.rivalScore}`,
    width / 2,
    mainScoreY,
    {
      color: result.teamScore > result.rivalScore ? "#f4ce0f" : "#ffffff",
      font: compact
        ? "900 116px Arial Black, Impact, sans-serif"
        : "900 148px Arial Black, Impact, sans-serif",
      shadowBlur: 24,
      shadowColor: "rgba(244,206,15,0.2)",
    },
  );

  if (hasPenalties) {
    drawPenaltyScore(context, {
      compact,
      result,
      width,
      y: penaltyScoreY,
    });
  }
}

function drawPenaltyScore(
  context: CanvasRenderingContext2D,
  {
    compact,
    result,
    width,
    y,
  }: {
    compact: boolean;
    result: ResultView;
    width: number;
    y: number;
  },
) {
  const lineWidth = compact ? 95 : 118;
  const centerGap = compact ? 78 : 96;
  const leftX = width / 2 - (compact ? 126 : 154);
  const rightX = width / 2 + (compact ? 126 : 154);

  context.save();
  context.strokeStyle = "rgba(255,255,255,0.56)";
  context.lineWidth = compact ? 4 : 5;
  context.beginPath();
  context.moveTo(leftX - lineWidth, y - (compact ? 13 : 16));
  context.lineTo(leftX - centerGap, y - (compact ? 13 : 16));
  context.moveTo(rightX + centerGap, y - (compact ? 13 : 16));
  context.lineTo(rightX + lineWidth, y - (compact ? 13 : 16));
  context.stroke();
  context.restore();

  drawCenteredText(context, `(${result.teamPenaltyScore})`, leftX, y, {
    color: "#ffffff",
    font: compact
      ? "900 52px Arial Black, sans-serif"
      : "900 64px Arial Black, sans-serif",
    shadowBlur: 16,
    shadowColor: "rgba(0,0,0,0.3)",
  });
  drawCenteredText(context, "PEN", width / 2, y - (compact ? 6 : 8), {
    color: "#f4ce0f",
    font: compact
      ? "900 28px Arial Black, sans-serif"
      : "900 34px Arial Black, sans-serif",
    letterSpacing: 4,
    shadowBlur: 12,
    shadowColor: "rgba(244,206,15,0.22)",
  });
  drawCenteredText(context, `(${result.rivalPenaltyScore})`, rightX, y, {
    color: "#ffffff",
    font: compact
      ? "900 52px Arial Black, sans-serif"
      : "900 64px Arial Black, sans-serif",
    shadowBlur: 16,
    shadowColor: "rgba(0,0,0,0.3)",
  });
}

function drawTeamSide(
  context: CanvasRenderingContext2D,
  {
    align,
    compact,
    label,
    maxWidth,
    role,
    x,
    y,
  }: {
    align: "left" | "right";
    compact: boolean;
    label: string;
    maxWidth: number;
    role: string;
    x: number;
    y: number;
  },
) {
  const textAlign = align === "left" ? "left" : "right";
  const lineHeight = compact ? 34 : 40;
  const fontSize = compact
    ? getTeamNameFontSize(label, 30)
    : getTeamNameFontSize(label, 36);
  const lines = getClampedLines(
    context,
    label.toUpperCase(),
    maxWidth,
    compact ? 3 : 3,
    `900 ${fontSize}px Arial Black, sans-serif`,
  );

  context.save();
  context.textAlign = textAlign;
  context.fillStyle = "#ffffff";
  context.font = `900 ${fontSize}px Arial Black, sans-serif`;
  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight, maxWidth);
  });

  context.fillStyle = "rgba(255,255,255,0.72)";
  context.font = compact ? "700 24px Arial, sans-serif" : "700 28px Arial, sans-serif";
  context.fillText(role, x, y + lineHeight * 3 + (compact ? 18 : 22), maxWidth);
  context.restore();
}

function drawScorersBlock(
  context: CanvasRenderingContext2D,
  {
    compact,
    scorers,
    width,
    y,
  }: {
    compact: boolean;
    scorers: string[];
    width: number;
    y: number;
  },
) {
  const height = compact ? 190 : 230;

  context.save();
  context.fillStyle = "rgba(0,36,93,0.72)";
  context.strokeStyle = "rgba(244,206,15,0.46)";
  context.lineWidth = 3;
  roundedRect(context, 120, y, width - 240, height, 30);
  context.fill();
  context.stroke();
  context.restore();

  drawCenteredText(context, "GOLES LNG", width / 2, y + (compact ? 58 : 68), {
    color: "#f4ce0f",
    font: compact
      ? "900 32px Arial Black, sans-serif"
      : "900 38px Arial Black, sans-serif",
    letterSpacing: 3,
  });

  drawWrappedCenteredText(
    context,
    scorers.join(" · "),
    width / 2,
    y + (compact ? 112 : 132),
    width - 300,
    {
      color: "#ffffff",
      font: compact ? "800 32px Arial, sans-serif" : "800 38px Arial, sans-serif",
      lineHeight: compact ? 42 : 48,
      maxLines: 2,
      shadowBlur: 10,
      shadowColor: "rgba(0,0,0,0.35)",
      uppercase: false,
    },
  );
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

function drawWrappedCenteredText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  {
    color,
    font,
    lineHeight,
    maxLines,
    shadowBlur = 0,
    shadowColor = "transparent",
    uppercase,
  }: {
    color: string;
    font: string;
    lineHeight: number;
    maxLines: number;
    shadowBlur?: number;
    shadowColor?: string;
    uppercase: boolean;
  },
) {
  context.save();
  context.fillStyle = color;
  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.shadowBlur = shadowBlur;
  context.shadowColor = shadowColor;

  const lines = wrapText(context, text, maxWidth).slice(0, maxLines);
  lines.forEach((line, index) => {
    context.fillText(uppercase ? line.toUpperCase() : line, x, y + index * lineHeight);
  });
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

  if (length > 32) {
    return baseSize - 6;
  }

  if (length > 24) {
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

function formatResultDate(value?: string) {
  if (!value) {
    return "Fecha a definir";
  }

  const date = new Date(`${value}T12:00:00-03:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).format(date);
}

function formatCompetition(kind: LeagueCompetitionKind) {
  const labels: Record<LeagueCompetitionKind, string> = {
    cup: "Copa",
    friendly: "Amistoso",
    league: "Liga",
  };

  return labels[kind] ?? "Partido";
}

interface ResultView {
  rivalName: string;
  rivalPenaltyScore?: number;
  rivalRole: string;
  rivalScore: number;
  teamName: string;
  teamPenaltyScore?: number;
  teamRole: string;
  teamScore: number;
}

function getResultView(match: LeagueFixtureMatch, teamName: string): ResultView {
  const isLocalTeam = sameTeam(match.localTeam, teamName);
  const teamScore = isLocalTeam ? match.localScore : match.visitorScore;
  const rivalScore = isLocalTeam ? match.visitorScore : match.localScore;
  const teamPenaltyScore = isLocalTeam
    ? match.localPenaltyScore
    : match.visitorPenaltyScore;
  const rivalPenaltyScore = isLocalTeam
    ? match.visitorPenaltyScore
    : match.localPenaltyScore;

  return {
    rivalName: isLocalTeam ? match.visitorTeam : match.localTeam,
    rivalPenaltyScore,
    rivalRole: isLocalTeam ? "Visita" : "Local",
    rivalScore: rivalScore ?? 0,
    teamName,
    teamPenaltyScore,
    teamRole: isLocalTeam ? "Local" : "Visita",
    teamScore: teamScore ?? 0,
  };
}

function getTeamGoalScorers(match: LeagueFixtureMatch, teamName: string) {
  const fromEvents = match.goalEvents
    .filter((event) => sameTeam(event.teamName, teamName) && !event.ownGoal)
    .map((event) => cleanGoalScorerName(event.playerName))
    .filter(Boolean);

  if (fromEvents.length > 0) {
    return fromEvents;
  }

  if (match.manualGoalScorers?.length) {
    return match.manualGoalScorers.map(cleanGoalScorerName).filter(Boolean);
  }

  return match.goals.flatMap((goal) => extractGoalScorers(goal, teamName));
}

function extractGoalScorers(goal: string, teamName: string) {
  const [label, detail] = goal.split(":");

  if (detail && sameTeam(label, teamName)) {
    return detail.split(/[,;·]/).map(cleanGoalScorerName).filter(Boolean);
  }

  if (normalizeTeamKey(goal).includes(normalizeTeamKey(teamName))) {
    return [goal.replace(/^.*?:/, "")].map(cleanGoalScorerName).filter(Boolean);
  }

  return [];
}

function cleanGoalScorerName(value: string) {
  return value
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sameTeam(first: string, second: string) {
  return normalizeTeamKey(first) === normalizeTeamKey(second);
}

function normalizeTeamKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(club|asociacion|deportiva|barrio)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
