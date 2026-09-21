"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";
import { drawFittedCrestImage } from "@/lib/crest-canvas";
import { getTeamCrestDataUrl, getTeamCrestFit } from "@/lib/team-profiles";
import type { PlayerOfMatchMatch, PlayerOfMatchResult } from "@/types/player-of-match";
import type { TeamCrestFit, TeamProfile } from "@/types/teams";

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;
const APP_TEAM_NAME = "La Nueva Guardia";
const BRAND_LOGO_SRC = "/brand/escudo-la-nueva-guardia.png";

interface LoadedTeamCrest {
  fit: TeamCrestFit;
  image?: HTMLImageElement;
  initials: string;
}

interface MvpStoryPalette {
  accent: string;
  avatarFillEnd: string;
  avatarFillStart: string;
  avatarInitialColor: string;
  avatarShadow: string;
  backgroundEnd: string;
  backgroundMiddle: string;
  backgroundStart: string;
  baseEnd: string;
  baseMiddle: string;
  baseStart: string;
  baseStroke: string;
  featuredRankColor: string;
  featuredStroke: string;
  footerColor: string;
  frameStroke: string;
  lowerGlow: string;
  metaColor: string;
  nameColor: string;
  rankColor: string;
  rivalColor: string;
  scoreBackground: string;
  scoreStroke: string;
  scoreTextColor: string;
  stripeStroke: string;
  titleColor: string;
  titleShadow: string;
  topGlow: string;
}

const DEFAULT_MVP_STORY_PALETTE: MvpStoryPalette = {
  accent: "#f4ce0f",
  avatarFillEnd: "#66c7ef",
  avatarFillStart: "#eaf8ff",
  avatarInitialColor: "#012f77",
  avatarShadow: "rgba(102,220,255,0.38)",
  backgroundEnd: "#020916",
  backgroundMiddle: "#012f77",
  backgroundStart: "#06162f",
  baseEnd: "rgba(1,47,119,0.82)",
  baseMiddle: "rgba(102,220,255,0.2)",
  baseStart: "rgba(255,255,255,0.2)",
  baseStroke: "rgba(102,220,255,0.58)",
  featuredRankColor: "#f4ce0f",
  featuredStroke: "rgba(244,206,15,0.65)",
  footerColor: "rgba(255,255,255,0.72)",
  frameStroke: "rgba(102,220,255,0.36)",
  lowerGlow: "rgba(102,220,255,0.2)",
  metaColor: "rgba(255,255,255,0.9)",
  nameColor: "#ffffff",
  rankColor: "#ffffff",
  rivalColor: "#f4ce0f",
  scoreBackground: "rgba(0,36,93,0.66)",
  scoreStroke: "rgba(102,220,255,0.42)",
  scoreTextColor: "rgba(255,255,255,0.94)",
  stripeStroke: "rgba(102,220,255,0.12)",
  titleColor: "#ffffff",
  titleShadow: "rgba(102,220,255,0.28)",
  topGlow: "rgba(0,148,220,0.72)",
};

const CUP_MVP_STORY_PALETTE: MvpStoryPalette = {
  accent: "#fff2b8",
  avatarFillEnd: "#ffe1a0",
  avatarFillStart: "#fff7df",
  avatarInitialColor: "#15304a",
  avatarShadow: "rgba(18,11,2,0.28)",
  backgroundEnd: "#2d1b03",
  backgroundMiddle: "#b9780f",
  backgroundStart: "#251604",
  baseEnd: "rgba(22,15,8,0.74)",
  baseMiddle: "rgba(17,24,39,0.44)",
  baseStart: "rgba(255,255,255,0.18)",
  baseStroke: "rgba(255,225,160,0.48)",
  featuredRankColor: "#fff2b8",
  featuredStroke: "rgba(255,225,160,0.72)",
  footerColor: "rgba(255,240,184,0.8)",
  frameStroke: "rgba(255,228,163,0.46)",
  lowerGlow: "rgba(18,48,71,0.28)",
  metaColor: "#fff0b8",
  nameColor: "#fff8df",
  rankColor: "#fff8df",
  rivalColor: "#fff2b8",
  scoreBackground: "rgba(22,15,8,0.58)",
  scoreStroke: "rgba(255,225,160,0.42)",
  scoreTextColor: "#fff8df",
  stripeStroke: "rgba(255,241,194,0.12)",
  titleColor: "#fff8df",
  titleShadow: "rgba(18,11,2,0.64)",
  topGlow: "rgba(255,212,106,0.62)",
};

const FRIENDLY_MVP_STORY_PALETTE: MvpStoryPalette = {
  accent: "#0b2d68",
  avatarFillEnd: "#dbeafe",
  avatarFillStart: "#ffffff",
  avatarInitialColor: "#0b2d68",
  avatarShadow: "rgba(15,47,102,0.18)",
  backgroundEnd: "#ffffff",
  backgroundMiddle: "#f2f7ff",
  backgroundStart: "#ffffff",
  baseEnd: "rgba(255,255,255,0.96)",
  baseMiddle: "rgba(234,242,255,0.94)",
  baseStart: "rgba(255,255,255,0.96)",
  baseStroke: "rgba(29,78,216,0.28)",
  featuredRankColor: "#0b2d68",
  featuredStroke: "rgba(29,78,216,0.46)",
  footerColor: "rgba(11,45,104,0.78)",
  frameStroke: "rgba(29,78,216,0.28)",
  lowerGlow: "rgba(29,78,216,0.13)",
  metaColor: "#0f3d82",
  nameColor: "#0b2d68",
  rankColor: "#0b2d68",
  rivalColor: "#0b2d68",
  scoreBackground: "#dbeafe",
  scoreStroke: "rgba(29,78,216,0.18)",
  scoreTextColor: "#0f3d82",
  stripeStroke: "rgba(147,197,253,0.28)",
  titleColor: "#0b2d68",
  titleShadow: "rgba(147,197,253,0.34)",
  topGlow: "rgba(191,219,254,0.88)",
};

interface MvpStoryShareButtonProps {
  disabled?: boolean;
  match: PlayerOfMatchMatch;
  teamProfiles?: TeamProfile[];
}

export function MvpStoryShareButton({
  disabled = false,
  match,
  teamProfiles = [],
}: MvpStoryShareButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState("");

  async function handleShare() {
    setIsPending(true);
    setMessage("");

    try {
      const blob = await createMvpStoryBlob(match, teamProfiles);
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

async function createMvpStoryBlob(
  match: PlayerOfMatchMatch,
  teamProfiles: TeamProfile[],
) {
  const canvas = document.createElement("canvas");
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Tu navegador no pudo preparar la imagen.");
  }

  await drawMvpStory(context, match, teamProfiles);

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
  teamProfiles: TeamProfile[],
) {
  const palette = getMvpStoryPalette(match.sourceType);
  const logo = await loadTeamCrestImage(teamProfiles, APP_TEAM_NAME);
  const orderedPodium = getOrderedPodium(match.results);
  const podiumImages = await Promise.all(
    orderedPodium.map((entry) =>
      entry?.photoDataUrl && isSafeCanvasImageSource(entry.photoDataUrl)
        ? loadImage(entry.photoDataUrl).catch(() => undefined)
        : Promise.resolve(undefined),
    ),
  );

  drawBackground(context, palette);

  drawTeamCrest(context, logo, STORY_WIDTH / 2 - 82, 88, 164, { framed: false });

  drawCenteredText(context, "MVP DEL PARTIDO", STORY_WIDTH / 2, 346, {
    color: palette.titleColor,
    font: "900 94px Impact, Arial Black, sans-serif",
    shadowBlur: 24,
    shadowColor: palette.titleShadow,
  });
  drawCenteredText(
    context,
    `${formatStoryDate(match.date)} / ${formatCompetition(match.sourceType)}`,
    STORY_WIDTH / 2,
    448,
    {
      color: palette.metaColor,
      font: "800 40px Arial, sans-serif",
      letterSpacing: 0,
    },
  );
  drawCenteredText(context, `VS ${match.rival.toUpperCase()}`, STORY_WIDTH / 2, 528, {
    color: palette.rivalColor,
    font: "900 52px Arial Black, Impact, sans-serif",
    maxWidth: 900,
    shadowBlur: 18,
    shadowColor: palette.titleShadow,
  });

  drawPodiumPlace(context, {
    avatarImage: podiumImages[1],
    baseHeight: 420,
    baseWidth: 270,
    centerX: 225,
    name: orderedPodium[1]?.playerName,
    palette,
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
    palette,
    place: 1,
    result: orderedPodium[0],
  });
  drawPodiumPlace(context, {
    avatarImage: podiumImages[2],
    baseHeight: 350,
    baseWidth: 250,
    centerX: 855,
    name: orderedPodium[2]?.playerName,
    palette,
    place: 3,
    result: orderedPodium[2],
  });

  drawCenteredText(context, "LA NUEVA GUARDIA", STORY_WIDTH / 2, 1818, {
    color: palette.footerColor,
    font: "800 34px Arial, sans-serif",
    letterSpacing: 0,
  });
}

function drawBackground(context: CanvasRenderingContext2D, palette: MvpStoryPalette) {
  const gradient = context.createLinearGradient(0, 0, 0, STORY_HEIGHT);
  gradient.addColorStop(0, palette.backgroundStart);
  gradient.addColorStop(0.38, palette.backgroundMiddle);
  gradient.addColorStop(1, palette.backgroundEnd);
  context.fillStyle = gradient;
  context.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  const glow = context.createRadialGradient(540, 330, 20, 540, 330, 560);
  glow.addColorStop(0, palette.topGlow);
  glow.addColorStop(1, "rgba(0,148,220,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  const lowerGlow = context.createRadialGradient(540, 1370, 80, 540, 1370, 640);
  lowerGlow.addColorStop(0, palette.lowerGlow);
  lowerGlow.addColorStop(1, "rgba(102,220,255,0)");
  context.fillStyle = lowerGlow;
  context.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  context.save();
  context.strokeStyle = palette.stripeStroke;
  context.lineWidth = 2;
  for (let x = -STORY_HEIGHT; x < STORY_WIDTH; x += 90) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + STORY_HEIGHT * 0.6, STORY_HEIGHT);
    context.stroke();
  }
  context.restore();

  context.save();
  context.strokeStyle = palette.frameStroke;
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
    palette,
    place,
    result,
  }: {
    avatarImage?: HTMLImageElement;
    baseHeight: number;
    baseWidth: number;
    centerX: number;
    featured?: boolean;
    name?: string;
    palette: MvpStoryPalette;
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
  const scoreY = baseTop + (featured ? 134 : place === 3 ? 84 : 104);
  const rankY = baseTop + baseHeight * (featured ? 0.58 : place === 3 ? 0.7 : 0.66);

  drawGlassBase(context, baseLeft, baseTop, baseWidth, baseHeight, featured, palette);
  drawCircularAvatar(context, {
    borderColor: featured ? palette.featuredStroke : palette.baseStroke,
    image: avatarImage,
    initials: getInitials(name ?? ""),
    palette,
    size: avatarSize,
    x: centerX,
    y: avatarY,
  });

  drawWrappedCenteredText(context, name ?? "Sin votos", centerX, nameY, baseWidth + 20, {
    color: palette.nameColor,
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
    palette,
  );

  drawCenteredText(context, `#${place}`, centerX, rankY, {
    color: featured ? palette.featuredRankColor : palette.rankColor,
    font: featured
      ? "900 118px Arial Black, Impact, sans-serif"
      : "900 96px Arial Black, Impact, sans-serif",
    shadowBlur: 18,
    shadowColor: featured ? palette.titleShadow : palette.avatarShadow,
  });
}

function drawGlassBase(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  featured: boolean,
  palette: MvpStoryPalette,
) {
  context.save();
  const baseGradient = context.createLinearGradient(x, y, x + width, y + height);
  baseGradient.addColorStop(0, palette.baseStart);
  baseGradient.addColorStop(0.42, palette.baseMiddle);
  baseGradient.addColorStop(1, palette.baseEnd);
  context.fillStyle = baseGradient;
  context.strokeStyle = featured ? palette.featuredStroke : palette.baseStroke;
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

  context.shadowColor = featured ? palette.titleShadow : palette.avatarShadow;
  context.shadowBlur = 28;
  context.strokeStyle = featured ? palette.featuredStroke : palette.baseStroke;
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
    palette,
    size,
    x,
    y,
  }: {
    borderColor: string;
    image?: HTMLImageElement;
    initials: string;
    palette: MvpStoryPalette;
    size: number;
    x: number;
    y: number;
  },
) {
  const radius = size / 2;

  context.save();
  context.shadowColor = palette.avatarShadow;
  context.shadowBlur = 28;
  context.fillStyle = palette.avatarFillStart;
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
    gradient.addColorStop(0, palette.avatarFillStart);
    gradient.addColorStop(1, palette.avatarFillEnd);
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, size, size);
    drawCenteredText(context, initials || "-", x, y + 18, {
      color: palette.avatarInitialColor,
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
    initials: "LNG",
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
    drawCenteredText(context, crest.initials, centerX, centerY + size * 0.13, {
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
  palette: MvpStoryPalette,
) {
  context.save();
  context.font = "800 27px Arial, sans-serif";
  const metrics = context.measureText(label);
  const width = Math.max(metrics.width + 44, 170);
  const height = 50;

  context.fillStyle = palette.scoreBackground;
  context.strokeStyle = palette.scoreStroke;
  context.lineWidth = 2;
  roundedRect(context, x - width / 2, y - height / 2, width, height, 25);
  context.fill();
  context.stroke();
  drawCenteredText(context, label, x, y + 9, {
    color: palette.scoreTextColor,
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

  return formatPlateDate(date);
}

function formatPlateDate(date: Date) {
  const formatterOptions = {
    timeZone: "America/Argentina/Buenos_Aires",
  } satisfies Intl.DateTimeFormatOptions;
  const day = new Intl.DateTimeFormat("es-AR", {
    ...formatterOptions,
    day: "numeric",
  }).format(date);
  const month = new Intl.DateTimeFormat("es-AR", {
    ...formatterOptions,
    month: "long",
  })
    .format(date)
    .toLocaleUpperCase("es-AR");
  const year = new Intl.DateTimeFormat("es-AR", {
    ...formatterOptions,
    year: "numeric",
  }).format(date);

  return `${day} ${month} ${year}`;
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
    cup: "COPA",
    friendly: "AMISTOSO",
    league: "LIGA",
  };

  return labels[sourceType] ?? "PARTIDO";
}

function getMvpStoryPalette(
  sourceType: PlayerOfMatchMatch["sourceType"],
): MvpStoryPalette {
  if (sourceType === "cup") {
    return CUP_MVP_STORY_PALETTE;
  }

  if (sourceType === "friendly") {
    return FRIENDLY_MVP_STORY_PALETTE;
  }

  return DEFAULT_MVP_STORY_PALETTE;
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
