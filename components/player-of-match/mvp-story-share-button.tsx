"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";
import type { PlayerOfMatchMatch, PlayerOfMatchResult } from "@/types/player-of-match";

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;
const BRAND_LOGO_SRC = "/brand/escudo-la-nueva-guardia.png";

interface MvpStoryShareButtonProps {
  disabled?: boolean;
  match: PlayerOfMatchMatch;
}

export function MvpStoryShareButton({
  disabled = false,
  match,
}: MvpStoryShareButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState("");

  async function handleShare() {
    setIsPending(true);
    setMessage("");

    try {
      const blob = await createMvpStoryBlob(match);
      const fileName = `mvp-${slugify(match.rival || "partido")}.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          text: `MVP del partido vs ${match.rival}`,
          title: "MVP del partido",
        });
        setMessage("Story lista para compartir.");
      } else {
        downloadBlob(blob, fileName);
        setMessage("Imagen descargada.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo generar la story.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="grid gap-2">
      <LoadingModal open={isPending} description="Preparando story..." />
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || isPending}
        onClick={() => void handleShare()}
      >
        <Share2 />
        Compartir en Instagram Stories
      </Button>
      {message ? (
        <p className="text-primary-foreground/80 text-center text-xs font-medium">
          {message}
        </p>
      ) : null}
    </div>
  );
}

async function createMvpStoryBlob(match: PlayerOfMatchMatch) {
  const canvas = document.createElement("canvas");
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Tu navegador no pudo preparar la imagen.");
  }

  await drawMvpStory(context, match);

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

async function drawMvpStory(
  context: CanvasRenderingContext2D,
  match: PlayerOfMatchMatch,
) {
  const logo = await loadImage(BRAND_LOGO_SRC).catch(() => undefined);
  const orderedPodium = getOrderedPodium(match.results);
  const podiumImages = await Promise.all(
    orderedPodium.map((entry) =>
      entry?.photoDataUrl && isSafeCanvasImageSource(entry.photoDataUrl)
        ? loadImage(entry.photoDataUrl).catch(() => undefined)
        : Promise.resolve(undefined),
    ),
  );

  drawBackground(context);

  if (logo) {
    drawContainedImage(context, logo, STORY_WIDTH / 2 - 92, 92, 184, 164);
  } else {
    drawFallbackLogo(context);
  }

  drawCenteredText(context, "MVP DEL PARTIDO", STORY_WIDTH / 2, 346, {
    color: "#ffffff",
    font: "900 94px Impact, Arial Black, sans-serif",
    shadowBlur: 24,
    shadowColor: "rgba(102,220,255,0.28)",
  });
  drawCenteredText(
    context,
    `${formatStoryDate(match.date)} / ${formatCompetition(match.sourceType)}`,
    STORY_WIDTH / 2,
    448,
    {
      color: "rgba(255,255,255,0.9)",
      font: "800 40px Arial, sans-serif",
      letterSpacing: 0,
    },
  );
  drawCenteredText(context, `VS ${match.rival.toUpperCase()}`, STORY_WIDTH / 2, 528, {
    color: "#f4ce0f",
    font: "900 52px Arial Black, Impact, sans-serif",
    maxWidth: 900,
    shadowBlur: 18,
    shadowColor: "rgba(244,206,15,0.22)",
  });

  drawPodiumPlace(context, {
    avatarImage: podiumImages[1],
    baseHeight: 420,
    baseWidth: 270,
    centerX: 225,
    name: orderedPodium[1]?.playerName,
    place: 2,
    result: orderedPodium[1],
  });
  drawPodiumPlace(context, {
    avatarImage: podiumImages[0],
    baseHeight: 565,
    baseWidth: 315,
    centerX: 540,
    featured: true,
    name: orderedPodium[0]?.playerName,
    place: 1,
    result: orderedPodium[0],
  });
  drawPodiumPlace(context, {
    avatarImage: podiumImages[2],
    baseHeight: 350,
    baseWidth: 250,
    centerX: 855,
    name: orderedPodium[2]?.playerName,
    place: 3,
    result: orderedPodium[2],
  });

  drawCenteredText(context, "LA NUEVA GUARDIA", STORY_WIDTH / 2, 1818, {
    color: "rgba(255,255,255,0.72)",
    font: "800 34px Arial, sans-serif",
    letterSpacing: 0,
  });
}

function drawBackground(context: CanvasRenderingContext2D) {
  const gradient = context.createLinearGradient(0, 0, 0, STORY_HEIGHT);
  gradient.addColorStop(0, "#06162f");
  gradient.addColorStop(0.38, "#012f77");
  gradient.addColorStop(1, "#020916");
  context.fillStyle = gradient;
  context.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  const glow = context.createRadialGradient(540, 330, 20, 540, 330, 560);
  glow.addColorStop(0, "rgba(0,148,220,0.72)");
  glow.addColorStop(1, "rgba(0,148,220,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  const lowerGlow = context.createRadialGradient(540, 1370, 80, 540, 1370, 640);
  lowerGlow.addColorStop(0, "rgba(102,220,255,0.2)");
  lowerGlow.addColorStop(1, "rgba(102,220,255,0)");
  context.fillStyle = lowerGlow;
  context.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  context.save();
  context.strokeStyle = "rgba(102,220,255,0.12)";
  context.lineWidth = 2;
  for (let x = -STORY_HEIGHT; x < STORY_WIDTH; x += 90) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + STORY_HEIGHT * 0.6, STORY_HEIGHT);
    context.stroke();
  }
  context.restore();

  context.save();
  context.strokeStyle = "rgba(102,220,255,0.36)";
  context.lineWidth = 3;
  roundedRect(context, 42, 42, STORY_WIDTH - 84, STORY_HEIGHT - 84, 44);
  context.stroke();
  context.restore();
}

function drawPodiumPlace(
  context: CanvasRenderingContext2D,
  {
    avatarImage,
    baseHeight,
    baseWidth,
    centerX,
    featured = false,
    name,
    place,
    result,
  }: {
    avatarImage?: HTMLImageElement;
    baseHeight: number;
    baseWidth: number;
    centerX: number;
    featured?: boolean;
    name?: string;
    place: 1 | 2 | 3;
    result?: PlayerOfMatchResult;
  },
) {
  const baseBottom = 1660;
  const baseTop = baseBottom - baseHeight;
  const baseLeft = centerX - baseWidth / 2;
  const avatarSize = Math.min(baseWidth - 28, featured ? 286 : 242);
  const avatarY = baseTop - avatarSize / 2 - 126;
  const nameY = baseTop - 82;
  const scoreY = baseTop + (featured ? 134 : 120);

  drawGlassBase(context, baseLeft, baseTop, baseWidth, baseHeight, featured);
  drawCircularAvatar(context, {
    borderColor: featured ? "#f4ce0f" : "rgba(255,255,255,0.92)",
    image: avatarImage,
    initials: getInitials(name ?? ""),
    size: avatarSize,
    x: centerX,
    y: avatarY,
  });

  drawWrappedCenteredText(context, name ?? "Sin votos", centerX, nameY, baseWidth + 20, {
    color: "#ffffff",
    font: `${featured ? "900 38px" : "900 34px"} Arial Black, Impact, sans-serif`,
    lineHeight: featured ? 40 : 36,
    maxLines: 2,
    shadowBlur: 9,
    shadowColor: "rgba(0,0,0,0.44)",
  });

  drawScorePill(
    context,
    centerX,
    scoreY,
    result
      ? `${result.votes} ${result.votes === 1 ? "voto" : "votos"} · ${result.points} pts`
      : "-",
  );

  drawCenteredText(context, `#${place}`, centerX, baseTop + baseHeight * 0.56, {
    color: featured ? "#f4ce0f" : "#ffffff",
    font: featured
      ? "900 118px Arial Black, Impact, sans-serif"
      : "900 96px Arial Black, Impact, sans-serif",
    shadowBlur: 18,
    shadowColor: featured ? "rgba(244,206,15,0.28)" : "rgba(102,220,255,0.22)",
  });
}

function drawGlassBase(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  featured: boolean,
) {
  context.save();
  const baseGradient = context.createLinearGradient(x, y, x + width, y + height);
  baseGradient.addColorStop(0, "rgba(255,255,255,0.2)");
  baseGradient.addColorStop(0.42, "rgba(102,220,255,0.2)");
  baseGradient.addColorStop(1, "rgba(1,47,119,0.82)");
  context.fillStyle = baseGradient;
  context.strokeStyle = featured ? "rgba(244,206,15,0.65)" : "rgba(102,220,255,0.58)";
  context.lineWidth = featured ? 6 : 4;
  roundedRect(context, x, y, width, height, 30);
  context.fill();
  context.stroke();

  context.fillStyle = "rgba(255,255,255,0.12)";
  context.beginPath();
  context.moveTo(x + width * 0.08, y + height * 0.04);
  context.lineTo(x + width * 0.96, y + height * 0.04);
  context.lineTo(x + width * 0.72, y + height * 0.28);
  context.lineTo(x + width * 0.2, y + height * 0.28);
  context.closePath();
  context.fill();

  context.shadowColor = featured ? "rgba(244,206,15,0.45)" : "rgba(102,220,255,0.42)";
  context.shadowBlur = 28;
  context.strokeStyle = featured ? "rgba(244,206,15,0.78)" : "rgba(102,220,255,0.78)";
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(x + 24, y + 18);
  context.lineTo(x + width - 24, y + 18);
  context.stroke();
  context.restore();
}

function drawCircularAvatar(
  context: CanvasRenderingContext2D,
  {
    borderColor,
    image,
    initials,
    size,
    x,
    y,
  }: {
    borderColor: string;
    image?: HTMLImageElement;
    initials: string;
    size: number;
    x: number;
    y: number;
  },
) {
  const radius = size / 2;

  context.save();
  context.shadowColor = "rgba(102,220,255,0.38)";
  context.shadowBlur = 28;
  context.fillStyle = "#eaf8ff";
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.save();
  context.beginPath();
  context.arc(x, y, radius - 8, 0, Math.PI * 2);
  context.clip();

  if (image) {
    drawImageCover(context, image, x - radius + 8, y - radius + 8, size - 16, size - 16);
  } else {
    const gradient = context.createLinearGradient(
      x - radius,
      y - radius,
      x + radius,
      y + radius,
    );
    gradient.addColorStop(0, "#eaf8ff");
    gradient.addColorStop(1, "#66c7ef");
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, size, size);
    drawCenteredText(context, initials || "-", x, y + 18, {
      color: "#012f77",
      font: `900 ${Math.round(size * 0.28)}px Arial Black, sans-serif`,
    });
  }
  context.restore();

  context.save();
  context.strokeStyle = borderColor;
  context.lineWidth = 10;
  context.beginPath();
  context.arc(x, y, radius - 5, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawFallbackLogo(context: CanvasRenderingContext2D) {
  context.save();
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(STORY_WIDTH / 2, 170, 82, 0, Math.PI * 2);
  context.fill();
  drawCenteredText(context, "LNG", STORY_WIDTH / 2, 190, {
    color: "#012f77",
    font: "900 48px Arial Black, sans-serif",
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

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const ratio = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / ratio;
  const sourceHeight = height / ratio;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

function drawScorePill(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
) {
  context.save();
  context.font = "800 27px Arial, sans-serif";
  const metrics = context.measureText(label);
  const width = Math.max(metrics.width + 44, 170);
  const height = 50;

  context.fillStyle = "rgba(0,36,93,0.66)";
  context.strokeStyle = "rgba(102,220,255,0.42)";
  context.lineWidth = 2;
  roundedRect(context, x - width / 2, y - height / 2, width, height, 25);
  context.fill();
  context.stroke();
  drawCenteredText(context, label, x, y + 9, {
    color: "rgba(255,255,255,0.94)",
    font: "800 27px Arial, sans-serif",
  });
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
  }: {
    color: string;
    font: string;
    lineHeight: number;
    maxLines: number;
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

  const lines = wrapText(context, text, maxWidth).slice(0, maxLines);
  lines.forEach((line, index) => {
    context.fillText(line.toUpperCase(), x, y + index * lineHeight);
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

function getOrderedPodium(results: PlayerOfMatchResult[]) {
  return [
    results.find((result) => result.rank === 1),
    results.find((result) => result.rank === 2),
    results.find((result) => result.rank === 3),
  ];
}

function formatStoryDate(value: string) {
  const date = parseStoryDate(value);

  if (!date) {
    return value || "Fecha a definir";
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).format(date);
}

function parseStoryDate(value: string) {
  if (!value) {
    return undefined;
  }

  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatCompetition(sourceType: PlayerOfMatchMatch["sourceType"]) {
  const labels: Record<PlayerOfMatchMatch["sourceType"], string> = {
    cup: "Copa",
    friendly: "Amistoso",
    league: "Liga",
  };

  return labels[sourceType] ?? "Partido";
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

function isSafeCanvasImageSource(source: string) {
  if (source.startsWith("data:") || source.startsWith("/")) {
    return true;
  }

  try {
    return new URL(source).origin === window.location.origin;
  } catch {
    return false;
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
