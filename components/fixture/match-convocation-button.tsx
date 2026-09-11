"use client";

import {
  ClipboardList,
  ImageDown,
  Save,
  Share2,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { updateFixtureMatchConvocation } from "@/app/(dashboard)/fixture/actions";
import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";
import { drawFittedCrestImage } from "@/lib/crest-canvas";
import { getTeamCrestDataUrl, getTeamCrestFit } from "@/lib/team-profiles";
import { cn } from "@/lib/utils";
import type { FixturePlayerOption, LeagueFixtureMatch } from "@/types/fixture";
import type { TeamCrestFit, TeamProfile } from "@/types/teams";

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;
const POST_WIDTH = 1080;
const POST_HEIGHT = 1350;
const BRAND_LOGO_SRC = "/brand/escudo-la-nueva-guardia.png";

type ConvocationShareFormat = "post" | "story";

interface LoadedTeamCrest {
  fit: TeamCrestFit;
  image?: HTMLImageElement;
  initials: string;
}

interface MatchConvocationButtonProps {
  className?: string;
  coachName?: string;
  match: LeagueFixtureMatch;
  playerOptions: FixturePlayerOption[];
  teamName: string;
  teamProfiles?: TeamProfile[];
}

interface ConvokedPlayer {
  id: string;
  jerseyNumber: string;
  name: string;
  position: string;
  positionAbbreviation: PlayerLineAbbreviation;
  sortOrder: number;
}

type PlayerLineAbbreviation = "ARQ" | "DEF" | "DEL" | "MED";

interface ParsedConvocation {
  matched: ConvokedPlayer[];
  missing: string[];
  total: number;
}

export function MatchConvocationButton({
  className,
  coachName = "",
  match,
  playerOptions,
  teamName,
  teamProfiles = [],
}: MatchConvocationButtonProps) {
  const router = useRouter();
  const savedListText = formatConvocationListText(match.convokedPlayerNames ?? []);
  const [open, setOpen] = useState(false);
  const [listText, setListText] = useState(savedListText);
  const [pendingFormat, setPendingFormat] = useState<ConvocationShareFormat | null>(null);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "neutral" | "success">(
    "neutral",
  );
  const [savedPlayerNames, setSavedPlayerNames] = useState(
    match.convokedPlayerNames ?? [],
  );
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(
    () => parseConvocationText(listText, playerOptions),
    [listText, playerOptions],
  );
  const rival = getMatchRival(match, teamName);
  const canExport = parsed.matched.length > 0;

  useEffect(() => {
    const playerNames = match.convokedPlayerNames ?? [];

    setSavedPlayerNames(playerNames);
    setListText(formatConvocationListText(playerNames));
  }, [match.convokedPlayerNames, match.id]);

  async function saveConvocationList({ silent = false } = {}) {
    setMessage("");
    setMessageTone("neutral");

    if (parsed.matched.length === 0) {
      setMessage("Cargá al menos un convocado identificado.");
      setMessageTone("error");
      return false;
    }

    const convokedPlayerNames = parsed.matched.map((player) => player.name);

    setSaving(true);

    try {
      const result = await updateFixtureMatchConvocation({
        convokedPlayerNames,
        dateTime: toDateTimeLocalValue(match),
        matchId: match.id,
      });

      if (!result.ok) {
        setMessage(result.message);
        setMessageTone("error");
        return false;
      }

      setSavedPlayerNames(convokedPlayerNames);
      setMessage(silent ? "" : result.message);
      setMessageTone("success");
      router.refresh();

      return true;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo guardar la convocatoria.",
      );
      setMessageTone("error");

      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleShare(format: ConvocationShareFormat) {
    const saved = await saveConvocationList({ silent: true });

    if (!saved) {
      return;
    }

    setPendingFormat(format);
    try {
      const blob = await createConvocationBlob({
        coachName,
        format,
        match,
        players: parsed.matched,
        teamName,
        teamProfiles,
      });
      const formatLabel = format === "story" ? "story" : "publicacion";
      const fileName = `convocados-${formatLabel}-${slugify(rival)}.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          text: `Convocados: ${teamName} vs ${rival}`,
          title: "Convocados",
        });
        setMessage("Convocados guardados y placa lista para compartir.");
      } else {
        downloadBlob(blob, fileName);
        setMessage("Convocados guardados e imagen descargada.");
      }
      setMessageTone("success");
    } catch (error) {
      if (isShareAbort(error)) {
        return;
      }

      setMessage(error instanceof Error ? error.message : "No se pudo generar la placa.");
      setMessageTone("error");
    } finally {
      setPendingFormat(null);
    }
  }

  if (!match.isClubMatch || match.involvesBye) {
    return null;
  }

  return (
    <section className={cn("grid gap-2", className)}>
      <LoadingModal
        open={saving || Boolean(pendingFormat)}
        description={
          saving
            ? "Guardando convocados..."
            : pendingFormat === "post"
              ? "Preparando publicación..."
              : "Preparando story..."
        }
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() => setOpen((current) => !current)}
      >
        <ClipboardList />
        Convocar jugadores
      </Button>

      {open ? (
        <div className="border-border bg-background grid gap-3 rounded-md border p-3">
          <div className="grid gap-1">
            <p className="text-sm font-semibold">Lista de convocados</p>
            <p className="text-muted-foreground text-xs">
              Pegá la lista numerada. La app identifica jugadores activos por nombre y
              arma la placa con camiseta y posición.
            </p>
          </div>

          <textarea
            value={listText}
            onChange={(event) => setListText(event.target.value)}
            rows={7}
            placeholder={`Nizuc vs LNG 15 HS\n\n1. Ivo Unzaga\n2. Bautista Toledo\n3. Roman Cetrangolo`}
            className="border-input bg-background focus-visible:ring-ring min-h-36 rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
          />

          <div className="grid gap-2 sm:grid-cols-3">
            <ConvocationMetric label="Leídos" value={String(parsed.total)} />
            <ConvocationMetric
              label="Identificados"
              value={String(parsed.matched.length)}
            />
            <ConvocationMetric
              label="Sin matchear"
              value={String(parsed.missing.length)}
            />
          </div>

          {parsed.matched.length > 0 ? (
            <div className="grid gap-2">
              <p className="text-muted-foreground text-xs font-semibold uppercase">
                Orden para la placa
              </p>
              <div className="grid gap-2">
                {parsed.matched.map((player) => (
                  <div
                    key={player.id}
                    className="border-border bg-muted/40 grid grid-cols-[3.25rem_minmax(0,1fr)_3.5rem] items-center gap-2 rounded-md border px-2 py-2 text-sm"
                  >
                    <span className="bg-primary text-primary-foreground rounded-md px-2 py-1 text-center font-bold">
                      {player.jerseyNumber ? `#${player.jerseyNumber}` : "--"}
                    </span>
                    <span className="truncate font-medium">{player.name}</span>
                    <span className="text-primary rounded-md bg-white px-2 py-1 text-center text-xs font-bold">
                      {player.positionAbbreviation}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {savedPlayerNames.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              Lista guardada: {savedPlayerNames.length} convocados.
            </p>
          ) : null}

          {parsed.missing.length > 0 ? (
            <div className="border-destructive/30 bg-destructive/10 text-destructive grid gap-2 rounded-md border p-3 text-sm">
              <p className="flex items-center gap-2 font-semibold">
                <TriangleAlert className="size-4" aria-hidden="true" />
                Revisar nombres
              </p>
              <p className="text-xs">
                No encontré en la base: {parsed.missing.join(", ")}.
              </p>
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canExport || saving || Boolean(pendingFormat)}
              onClick={() => void saveConvocationList()}
            >
              <Save />
              Guardar lista
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!canExport || saving || Boolean(pendingFormat)}
              onClick={() => void handleShare("story")}
            >
              <Share2 />
              Story
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canExport || saving || Boolean(pendingFormat)}
              onClick={() => void handleShare("post")}
            >
              <ImageDown />
              Publicación
            </Button>
          </div>

          {message ? (
            <p
              className={cn(
                "text-center text-xs font-medium",
                messageTone === "error"
                  ? "text-destructive"
                  : messageTone === "success"
                    ? "text-emerald-700"
                    : "text-muted-foreground",
              )}
            >
              {message}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function formatConvocationListText(playerNames: string[]) {
  return playerNames.map((playerName, index) => `${index + 1}. ${playerName}`).join("\n");
}

function ConvocationMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border bg-muted/30 rounded-md border p-2">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="mt-1 flex items-center gap-1 text-lg font-semibold">
        <UsersRound className="text-primary size-4" aria-hidden="true" />
        {value}
      </p>
    </div>
  );
}

function parseConvocationText(
  text: string,
  playerOptions: FixturePlayerOption[],
): ParsedConvocation {
  const names = extractConvocationNames(text);
  const usedPlayerIds = new Set<string>();
  const matched: ConvokedPlayer[] = [];
  const missing: string[] = [];

  names.forEach((name) => {
    const player = findMatchingPlayer(name, playerOptions, usedPlayerIds);

    if (!player) {
      missing.push(name);
      return;
    }

    usedPlayerIds.add(player.id);
    matched.push({
      id: player.id,
      jerseyNumber: player.jerseyNumber?.trim() ?? "",
      name: player.name,
      position: player.position?.trim() || player.secondPosition?.trim() || "",
      positionAbbreviation: getPositionAbbreviation(
        player.position || player.secondPosition || "",
      ),
      sortOrder: getPositionSortOrder(player.position || player.secondPosition || ""),
    });
  });

  return {
    matched: sortConvokedPlayers(matched),
    missing,
    total: names.length,
  };
}

function extractConvocationNames(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const numberedNames = lines
    .map((line) => line.match(/^(?:\d{1,2}\s*[\).:-]|[-*•])\s*(.+)$/)?.[1])
    .filter((line): line is string => Boolean(line))
    .map(cleanConvocationName)
    .filter(Boolean);

  if (numberedNames.length > 0) {
    return Array.from(new Set(numberedNames));
  }

  return Array.from(
    new Set(
      lines
        .filter((line) => !looksLikeMatchHeader(line))
        .map(cleanConvocationName)
        .filter(Boolean),
    ),
  );
}

function cleanConvocationName(value: string) {
  return value
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeMatchHeader(value: string) {
  const normalized = normalizeName(value);

  return (
    /\bvs\b/.test(normalized) ||
    /\blng\b/.test(normalized) ||
    /\bhs\b/.test(normalized) ||
    /\bhora\b/.test(normalized)
  );
}

function findMatchingPlayer(
  name: string,
  playerOptions: FixturePlayerOption[],
  usedPlayerIds: Set<string>,
) {
  const targetVariants = getNameVariants(name);
  const exactMatch = playerOptions.find(
    (player) =>
      !usedPlayerIds.has(player.id) &&
      getNameVariants(player.name).some((variant) => targetVariants.includes(variant)),
  );

  if (exactMatch) {
    return exactMatch;
  }

  const targetTokens = normalizeName(name)
    .split(" ")
    .filter((token) => token.length > 1);

  if (targetTokens.length < 2) {
    return undefined;
  }

  const tokenMatches = playerOptions.filter((player) => {
    if (usedPlayerIds.has(player.id)) {
      return false;
    }

    const playerTokens = new Set(normalizeName(player.name).split(" "));

    return targetTokens.every((token) => playerTokens.has(token));
  });

  return tokenMatches.length === 1 ? tokenMatches[0] : undefined;
}

function getNameVariants(value: string) {
  const variants = [normalizeName(value)];
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 2) {
    variants.push(normalizeName(`${parts[1]} ${parts[0]}`));
  }

  return Array.from(new Set(variants.filter(Boolean)));
}

function sortConvokedPlayers(players: ConvokedPlayer[]) {
  return [...players].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    const leftNumber = Number(left.jerseyNumber);
    const rightNumber = Number(right.jerseyNumber);

    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber || left.name.localeCompare(right.name, "es");
    }

    return left.name.localeCompare(right.name, "es");
  });
}

function getPositionAbbreviation(position: string): PlayerLineAbbreviation {
  const normalized = normalizeName(position);

  if (normalized.includes("arquero")) {
    return "ARQ";
  }

  if (
    normalized.includes("defensor") ||
    normalized.includes("lateral izquierdo") ||
    normalized.includes("lateral derecho")
  ) {
    return "DEF";
  }

  if (normalized.includes("extremo") || normalized.includes("delantero")) {
    return "DEL";
  }

  return "MED";
}

function getPositionSortOrder(position: string) {
  const abbreviation = getPositionAbbreviation(position);
  const orders: Record<PlayerLineAbbreviation, number> = {
    ARQ: 0,
    DEF: 1,
    MED: 2,
    DEL: 3,
  };

  return orders[abbreviation];
}

async function createConvocationBlob({
  coachName,
  format,
  match,
  players,
  teamName,
  teamProfiles,
}: {
  coachName?: string;
  format: ConvocationShareFormat;
  match: LeagueFixtureMatch;
  players: ConvokedPlayer[];
  teamName: string;
  teamProfiles: TeamProfile[];
}) {
  const canvas = document.createElement("canvas");
  const compact = format === "post";

  canvas.width = compact ? POST_WIDTH : STORY_WIDTH;
  canvas.height = compact ? POST_HEIGHT : STORY_HEIGHT;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Tu navegador no pudo preparar la imagen.");
  }

  await drawConvocationPlate(context, {
    compact,
    coachName,
    height: canvas.height,
    match,
    players,
    teamName,
    teamProfiles,
    width: canvas.width,
  });

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

async function drawConvocationPlate(
  context: CanvasRenderingContext2D,
  {
    compact,
    coachName,
    height,
    match,
    players,
    teamName,
    teamProfiles,
    width,
  }: {
    compact: boolean;
    coachName?: string;
    height: number;
    match: LeagueFixtureMatch;
    players: ConvokedPlayer[];
    teamName: string;
    teamProfiles: TeamProfile[];
    width: number;
  },
) {
  const logo = await loadTeamCrestImage(teamProfiles, teamName);
  const rival = getMatchRival(match, teamName);
  const footerY = height - (compact ? 64 : 104);
  const listY = compact ? 388 : 580;
  const listHeight = footerY - listY - (compact ? 52 : 82);

  drawBackground(context, width, height);

  const logoSize = compact ? 112 : 132;
  drawTeamCrest(context, logo, width / 2 - logoSize / 2, compact ? 48 : 86, logoSize, {
    framed: false,
  });

  drawCenteredText(context, "CONVOCADOS", width / 2, compact ? 230 : 342, {
    color: "#ffffff",
    font: compact
      ? "900 76px Impact, Arial Black, sans-serif"
      : "900 94px Impact, Arial Black, sans-serif",
    maxWidth: width - 130,
    shadowBlur: 26,
    shadowColor: "rgba(102,220,255,0.34)",
  });

  drawCenteredText(
    context,
    formatConvocationMatchMeta(match),
    width / 2,
    compact ? 292 : 426,
    {
      color: "rgba(255,255,255,0.88)",
      font: compact ? "800 30px Arial, sans-serif" : "800 36px Arial, sans-serif",
      maxWidth: width - 160,
    },
  );

  drawWrappedCenteredText(
    context,
    `VS ${rival}`,
    width / 2,
    compact ? 344 : 506,
    width - 140,
    {
      color: "#f4ce0f",
      font: compact
        ? "900 38px Arial Black, Impact, sans-serif"
        : "900 48px Arial Black, Impact, sans-serif",
      lineHeight: compact ? 44 : 56,
      maxLines: 2,
      uppercase: true,
    },
  );

  drawConvocationList(context, {
    compact,
    coachName,
    height: listHeight,
    players,
    width: width - (compact ? 112 : 128),
    x: compact ? 56 : 64,
    y: listY,
  });

  drawCenteredText(context, "LA NUEVA GUARDIA", width / 2, footerY, {
    color: "rgba(255,255,255,0.72)",
    font: compact ? "800 30px Arial, sans-serif" : "800 34px Arial, sans-serif",
    letterSpacing: 0,
    maxWidth: width - 160,
  });
}

function drawConvocationList(
  context: CanvasRenderingContext2D,
  {
    compact,
    coachName,
    height,
    players,
    width,
    x,
    y,
  }: {
    compact: boolean;
    coachName?: string;
    height: number;
    players: ConvokedPlayer[];
    width: number;
    x: number;
    y: number;
  },
) {
  context.save();
  const gradient = context.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, "rgba(255,255,255,0.18)");
  gradient.addColorStop(0.55, "rgba(0,148,220,0.2)");
  gradient.addColorStop(1, "rgba(255,255,255,0.09)");
  context.fillStyle = gradient;
  roundedRect(context, x, y, width, height, 34);
  context.fill();
  context.restore();

  const padding = compact ? 34 : 42;
  const columns = 1;
  const gap = 0;
  const columnWidth = width - padding * 2;
  const rowsPerColumn = players.length;
  const headerHeight = 0;
  const coachHeight = coachName ? (compact ? 52 : 64) : 0;
  const rowsAvailableHeight =
    height - padding * 2 - headerHeight - coachHeight - (coachName ? 12 : 0);
  const rowHeight = Math.min(
    compact ? 58 : 64,
    Math.max(38, Math.floor(rowsAvailableHeight / Math.max(rowsPerColumn, 1))),
  );
  const rowFont = rowHeight < 44 ? 22 : rowHeight < 50 ? 25 : compact ? 27 : 30;
  const jerseyWidth = compact ? 56 : 62;
  const positionWidth = compact ? 58 : 68;

  for (let column = 0; column < columns; column += 1) {
    const columnPlayers = players.slice(
      column * rowsPerColumn,
      column * rowsPerColumn + rowsPerColumn,
    );
    const columnX = x + padding + column * (columnWidth + gap);
    const firstRowY = y + padding + headerHeight;

    columnPlayers.forEach((player, index) => {
      const rowY = firstRowY + index * rowHeight;
      const rowBottom = rowY + rowHeight - 8;
      const isStriped = index % 2 === 0;

      context.save();
      context.fillStyle = isStriped ? "rgba(255,255,255,0.1)" : "rgba(2,9,22,0.26)";
      roundedRect(context, columnX, rowY, columnWidth, rowHeight - 8, 18);
      context.fill();
      context.restore();

      context.save();
      context.fillStyle = "#f4ce0f";
      roundedRect(context, columnX + 10, rowY + 8, jerseyWidth, rowHeight - 24, 12);
      context.fill();
      context.fillStyle = "#012f77";
      context.font = `900 ${rowFont}px Arial Black, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(
        player.jerseyNumber || "--",
        columnX + 10 + jerseyWidth / 2,
        rowY + (rowBottom - rowY) / 2,
        jerseyWidth - 10,
      );
      context.restore();

      const nameX = columnX + 24 + jerseyWidth;
      const positionX = columnX + columnWidth - positionWidth - 10;
      const nameMaxWidth = Math.max(80, positionX - nameX - 12);
      const playerName = fitTextWithEllipsis(
        context,
        formatDisplayPersonName(player.name),
        nameMaxWidth,
        `800 ${rowFont}px Arial, sans-serif`,
      );

      drawTableText(context, playerName, nameX, rowY + rowHeight / 2 + rowFont / 3 - 5, {
        align: "left",
        color: "#ffffff",
        font: `800 ${rowFont}px Arial, sans-serif`,
        maxWidth: nameMaxWidth,
      });

      context.save();
      context.fillStyle = getPositionColor(player.positionAbbreviation);
      roundedRect(context, positionX, rowY + 9, positionWidth, rowHeight - 26, 12);
      context.fill();
      context.fillStyle = "#ffffff";
      context.font = `900 ${Math.max(18, rowFont - 6)}px Arial Black, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(
        player.positionAbbreviation,
        positionX + positionWidth / 2,
        rowY + (rowBottom - rowY) / 2,
        positionWidth - 8,
      );
      context.restore();
    });
  }

  if (coachName) {
    drawCenteredText(
      context,
      `DT: ${coachName}`,
      x + width / 2,
      y + height - padding + (compact ? 4 : 0),
      {
        color: "rgba(255,255,255,0.86)",
        font: compact ? "800 24px Arial, sans-serif" : "800 30px Arial, sans-serif",
        maxWidth: width - padding * 2,
      },
    );
  }
}

function getPositionColor(position: PlayerLineAbbreviation) {
  const colors: Record<PlayerLineAbbreviation, string> = {
    ARQ: "#6d5dfc",
    DEF: "#0094dc",
    DEL: "#d60b0b",
    MED: "#00866b",
  };

  return colors[position];
}

function drawBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#06162f");
  gradient.addColorStop(0.42, "#013a86");
  gradient.addColorStop(1, "#020916");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(width / 2, 260, 20, width / 2, 260, 660);
  glow.addColorStop(0, "rgba(0,148,220,0.72)");
  glow.addColorStop(1, "rgba(0,148,220,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.save();
  context.strokeStyle = "rgba(102,220,255,0.12)";
  context.lineWidth = 2;
  for (let lineX = -height; lineX < width; lineX += 88) {
    context.beginPath();
    context.moveTo(lineX, 0);
    context.lineTo(lineX + height * 0.6, height);
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
    uppercase = false,
  }: {
    color: string;
    font: string;
    lineHeight: number;
    maxLines: number;
    uppercase?: boolean;
  },
) {
  const words = (uppercase ? text.toUpperCase() : text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  context.save();
  context.font = font;

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;

    if (context.measureText(next).width <= maxWidth || !current) {
      current = next;
      return;
    }

    lines.push(current);
    current = word;
  });

  if (current) {
    lines.push(current);
  }

  const visibleLines = lines.slice(0, maxLines);

  if (lines.length > maxLines && visibleLines.length > 0) {
    visibleLines[visibleLines.length - 1] = fitTextWithEllipsis(
      context,
      visibleLines[visibleLines.length - 1],
      maxWidth,
      font,
    );
  }

  context.restore();

  const firstY = y - ((visibleLines.length - 1) * lineHeight) / 2;

  visibleLines.forEach((line, index) => {
    drawCenteredText(context, line, x, firstY + index * lineHeight, {
      color,
      font,
      maxWidth,
      shadowBlur: 16,
      shadowColor: "rgba(0,0,0,0.22)",
    });
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

function fitTextWithEllipsis(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font?: string,
) {
  context.save();

  if (font) {
    context.font = font;
  }

  const ellipsis = "...";

  if (context.measureText(text).width <= maxWidth) {
    context.restore();
    return text;
  }

  let nextText = text;

  while (
    nextText.length > 0 &&
    context.measureText(`${nextText}${ellipsis}`).width > maxWidth
  ) {
    nextText = nextText.slice(0, -1).trim();
  }

  context.restore();

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

function formatConvocationMatchMeta(match: LeagueFixtureMatch) {
  return [formatCompetition(match.competitionKind), formatMatchDate(match), match.time]
    .filter(Boolean)
    .join(" / ");
}

function formatCompetition(kind: LeagueFixtureMatch["competitionKind"]) {
  const labels: Record<LeagueFixtureMatch["competitionKind"], string> = {
    cup: "COPA",
    friendly: "AMISTOSO",
    league: "LIGA",
  };

  return labels[kind];
}

function formatMatchDate(match: LeagueFixtureMatch) {
  const value = match.dateIso || match.roundDate;
  const date = value ? parseDate(value) : undefined;

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

function toDateTimeLocalValue(match: LeagueFixtureMatch) {
  const date = match.dateIso ?? new Date().toISOString().slice(0, 10);
  const timeMatch = /^(\d{1,2}):(\d{2})/.exec(match.time);
  const time = timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : "12:00";

  return `${date}T${time}`;
}

function formatDisplayPersonName(value: string) {
  return value
    .toLocaleLowerCase("es-AR")
    .replace(
      /(^|[\s'-])(\S)/g,
      (_match, separator: string, letter: string) =>
        `${separator}${letter.toLocaleUpperCase("es-AR")}`,
    )
    .trim();
}

function parseDate(value: string) {
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    return new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3]),
      12,
    );
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function getMatchRival(match: LeagueFixtureMatch, teamName: string) {
  return sameTeam(match.localTeam, teamName) ? match.visitorTeam : match.localTeam;
}

function sameTeam(first: string, second: string) {
  return normalizeName(first) === normalizeName(second);
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
