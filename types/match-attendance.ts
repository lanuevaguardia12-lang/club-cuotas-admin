import type { DataSourceState } from "@/types/dashboard";
import type { LeagueCompetitionKind } from "@/types/fixture";
import type { PlayerDirectoryItem } from "@/types/players";

export interface AttendanceMatch {
  id: string;
  date: string;
  period: string;
  rival: string;
  sourceType?: LeagueCompetitionKind;
  players: string[];
  participantPlayerIds?: string[];
  venue: string;
  coachAttended: boolean;
  loadedAt: string;
}
export interface UpsertMatchAttendanceInput {
  id?: string;
  date: string;
  rival: string;
  sourceType: LeagueCompetitionKind;
  venue: string;
  coachAttended: boolean;
  playerIds: string[];
}
export interface MatchAttendanceData {
  matches: AttendanceMatch[];
  players: PlayerDirectoryItem[];
  source: DataSourceState;
}
