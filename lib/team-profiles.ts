import type { TeamCrestFit, TeamProfile } from "@/types/teams";

export const TEAM_SHORT_NAME_MAX_LENGTH = 50;
export const DEFAULT_TEAM_CREST_FIT: TeamCrestFit = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1.08,
};

export function createTeamProfileId(name: string) {
  return normalizeTeamProfileKey(name).replace(/\s+/g, "-");
}

export function getDefaultTeamShortName(name: string) {
  const cleaned = name
    .replace(/^club\s+/i, "")
    .replace(/^asociaci[oó]n deportiva\s+/i, "")
    .replace(/^asoc\.?\s+deportiva\s+/i, "")
    .trim();

  return sanitizeTeamShortName(cleaned || name);
}

export function sanitizeTeamShortName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, TEAM_SHORT_NAME_MAX_LENGTH);
}

export function findTeamProfile(
  teamProfiles: TeamProfile[] | undefined,
  teamName: string,
) {
  const targetKey = normalizeTeamProfileKey(teamName);

  if (!targetKey) {
    return undefined;
  }

  return teamProfiles?.find((profile) => {
    const profileKeys = [
      profile.id,
      profile.name,
      profile.shortName,
      getDefaultTeamShortName(profile.name),
    ].map(normalizeTeamProfileKey);

    return profileKeys.includes(targetKey);
  });
}

export function getTeamDisplayName(
  teamProfiles: TeamProfile[] | undefined,
  teamName: string,
) {
  return findTeamProfile(teamProfiles, teamName)?.shortName || teamName;
}

export function getTeamCrestDataUrl(
  teamProfiles: TeamProfile[] | undefined,
  teamName: string,
) {
  return findTeamProfile(teamProfiles, teamName)?.crestDataUrl || "";
}

export function getTeamCrestFit(
  teamProfiles: TeamProfile[] | undefined,
  teamName: string,
): TeamCrestFit {
  const profile = findTeamProfile(teamProfiles, teamName);

  return normalizeTeamCrestFit({
    offsetX: profile?.crestOffsetX,
    offsetY: profile?.crestOffsetY,
    zoom: profile?.crestZoom,
  });
}

export function normalizeTeamCrestFit(input?: {
  offsetX?: unknown;
  offsetY?: unknown;
  zoom?: unknown;
} | null): TeamCrestFit {
  return {
    offsetX: clampFiniteNumber(input?.offsetX, -50, 50, DEFAULT_TEAM_CREST_FIT.offsetX),
    offsetY: clampFiniteNumber(input?.offsetY, -50, 50, DEFAULT_TEAM_CREST_FIT.offsetY),
    zoom: clampFiniteNumber(input?.zoom, 0.7, 2.6, DEFAULT_TEAM_CREST_FIT.zoom),
  };
}

export function normalizeTeamProfileKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(club|asociacion deportiva|asoc deportiva)\s+/, "")
    .replace(/\s+/g, " ");
}

function clampFiniteNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed =
    typeof value === "number"
      ? value
      : Number(
          String(value ?? "")
            .trim()
            .replace(",", "."),
        );

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}
