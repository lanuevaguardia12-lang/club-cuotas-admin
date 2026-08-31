import type { DataSourceState } from "@/types/dashboard";

export type LeagueMatchStatus = "pending" | "played" | "without-result";
export type LeagueCompetitionKind = "league" | "cup" | "friendly";

export interface LeagueCategoryOption {
  id: string;
  name: string;
  tournamentId: string;
}

export interface LeagueTournamentOption {
  id: string;
  name: string;
  categories: LeagueCategoryOption[];
}

export interface LeagueStandingRow {
  position: number;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  isClub: boolean;
}

export interface LeagueGoalEvent {
  ownGoal?: boolean;
  playerName: string;
  teamName: string;
}

export interface LeagueScorerRow {
  goals: number;
  playerName: string;
  teamName: string;
}

export interface LeagueFixtureMatch {
  id: string;
  competitionKind: LeagueCompetitionKind;
  competitionName: string;
  categoryName: string;
  round: string;
  roundDate: string;
  dateIso?: string;
  time: string;
  localTeam: string;
  visitorTeam: string;
  status: LeagueMatchStatus;
  localScore?: number;
  visitorScore?: number;
  localPenaltyScore?: number;
  visitorPenaltyScore?: number;
  detailUrl?: string;
  goalEvents: LeagueGoalEvent[];
  goals: string[];
  manualGoalScorers?: string[];
  cards: string[];
  isClubMatch: boolean;
  involvesBye: boolean;
  resultOverrideUpdatedAt?: string;
  scheduleOverrideUpdatedAt?: string;
}

export interface LeagueFixtureRound {
  name: string;
  date: string;
  matches: LeagueFixtureMatch[];
}

export interface LeagueFixtureData {
  availableYears: number[];
  selectedCompetitionKey: string;
  selectedCompetitionKind: LeagueCompetitionKind;
  selectedYear: number;
  selectedTournamentId: string;
  selectedCategoryId: string;
  selectedTournamentName: string;
  selectedCategoryName: string;
  tournaments: LeagueTournamentOption[];
  standings: LeagueStandingRow[];
  matches: LeagueFixtureMatch[];
  rounds: LeagueFixtureRound[];
  clubStanding?: LeagueStandingRow;
  allCompetitionMatches: LeagueFixtureMatch[];
  allClubMatches: LeagueFixtureMatch[];
  clubMatches: LeagueFixtureMatch[];
  nextMatches: LeagueFixtureMatch[];
  lastMatches: LeagueFixtureMatch[];
  scorers: LeagueScorerRow[];
  source: DataSourceState & {
    fetchedAt: string;
    sourceUrl: string;
  };
}

export interface FixtureMatchScheduleOverride {
  goalScorers: string[];
  localScore?: number;
  localPenaltyScore?: number;
  matchId: string;
  dateTime: string;
  updatedAt: string;
  updatedByName: string;
  updatedByUserId: string;
  visitorPenaltyScore?: number;
  visitorScore?: number;
}

export interface UpdateFixtureMatchScheduleInput {
  goalScorers?: string[];
  localScore?: number;
  localPenaltyScore?: number;
  matchId: string;
  dateTime: string;
  updatedByName: string;
  updatedByUserId: string;
  visitorPenaltyScore?: number;
  visitorScore?: number;
}

export interface FixturePlayerOption {
  id: string;
  jerseyNumber?: string;
  name: string;
  position?: string;
  secondPosition?: string;
}
