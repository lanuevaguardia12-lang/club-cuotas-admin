import type { TeamProfile } from "@/types/teams";

export const TEAM_SHORT_NAME_MAX_LENGTH = "LA NUEVA GUARDIA".length;

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
