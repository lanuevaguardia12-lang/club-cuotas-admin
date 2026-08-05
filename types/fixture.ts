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
  detailUrl?: string;
  goals: string[];
  cards: string[];
  isClubMatch: boolean;
  involvesBye: boolean;
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
  clubMatches: LeagueFixtureMatch[];
  nextMatches: LeagueFixtureMatch[];
  source: DataSourceState & {
    fetchedAt: string;
    sourceUrl: string;
  };
}
