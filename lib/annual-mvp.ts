import { z } from "zod";

import { attendanceToday } from "@/lib/match-attendance";
import type { AuthUser } from "@/types/auth";
import type { MatchAttendanceData } from "@/types/match-attendance";

export const annualMvpYearSchema = z.coerce.number().int().min(1900).max(9999);

export interface AnnualMvpCandidate {
  id: string;
  name: string;
  playerId?: string;
}

export interface AnnualMvpSurvey {
  year: number;
  closed: boolean;
  candidates: (AnnualMvpCandidate & { votes: number })[];
  userVoteId?: string;
}

export function annualMvpHref(year?: number) {
  return `/player-of-match?tab=mvp-del-ano${year === undefined ? "" : `&anio=${year}#mvp-del-ano-${year}`}`;
}

function normalizeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es");
}

export function getAnnualMvpCandidates(
  data: Pick<MatchAttendanceData, "matches" | "players">,
  year: number,
  today = attendanceToday(),
) {
  const names = new Map(data.players.map((player) => [player.id, player.name]));
  const candidates = new Map<string, AnnualMvpCandidate>();
  const matches = data.matches.filter(
    ({ date }) => date.startsWith(`${year}-`) && date.slice(0, 10) <= today,
  );
  for (const match of matches) {
    const participants =
      match.participants ??
      match.players.map((playerName) => ({ playerName, playerId: undefined }));
    for (const { playerName, playerId } of participants) {
      const name = (playerId ? (names.get(playerId) ?? playerName) : playerName).trim();
      const key = normalizeName(name);
      if (!key) continue;
      const id = playerId ? `player:${playerId}` : `name:${key}`;
      if (!candidates.has(id)) candidates.set(id, { id, name, playerId });
    }
  }
  const knownNames = new Set(
    [...candidates.values()]
      .filter((candidate) => candidate.playerId)
      .map((candidate) => normalizeName(candidate.name)),
  );
  return [...candidates.values()]
    .filter(
      (candidate) => candidate.playerId || !knownNames.has(normalizeName(candidate.name)),
    )
    .sort((left, right) => left.name.localeCompare(right.name, "es"));
}

export function isAnnualMvpSelfVote(candidate: AnnualMvpCandidate, user: AuthUser) {
  if (user.role !== "player") return false;
  if (candidate.playerId && user.playerId) return candidate.playerId === user.playerId;
  return normalizeName(candidate.name) === normalizeName(user.name);
}
