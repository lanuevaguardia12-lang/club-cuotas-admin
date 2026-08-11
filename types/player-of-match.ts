import type { DataSourceState } from "@/types/dashboard";
import type { LeagueCompetitionKind } from "@/types/fixture";

export interface PlayerOfMatchVote {
  id: string;
  matchId: string;
  matchDate: string;
  rival: string;
  voterUserId: string;
  voterPlayerId?: string;
  voterName: string;
  firstVotePlayerName: string;
  secondVotePlayerName: string;
  createdAt: string;
}

export interface PlayerOfMatchMatch {
  id: string;
  title: string;
  date: string;
  period: string;
  rival: string;
  sourceType: LeagueCompetitionKind;
  sourceLabel: string;
  resultLabel: string;
  players: string[];
  results: PlayerOfMatchResult[];
  totalVotes: number;
  totalVoters: number;
  votingStartsAt: string;
  votingEndsAt: string;
  votingStatus: "scheduled" | "open" | "closed";
  canEdit: boolean;
  userVote?: PlayerOfMatchVote;
}

export interface PlayerOfMatchResult {
  playerName: string;
  photoDataUrl?: string;
  rank: number;
  votes: number;
}

export interface PlayerOfMatchRankingRow {
  firstPlaces: number;
  photoDataUrl?: string;
  playerId?: string;
  playerName: string;
  rank: number;
  secondPlaces: number;
  thirdPlaces: number;
  totalPodiums: number;
}

export interface PlayerStreakRankingRow {
  currentStreak: number;
  lastAttendanceDate: string;
  lastAttendanceRival: string;
  photoDataUrl?: string;
  playerId: string;
  playerName: string;
  rank: number;
}

export interface PlayerAttendanceRankingRow {
  attendanceRate: number;
  attendedMatches: number;
  photoDataUrl?: string;
  playerId: string;
  playerName: string;
  rank: number;
  totalMatches: number;
}

export interface PlayerOfMatchCurrentRanking {
  attendanceRank?: number;
  attendanceRate: number;
  attendedMatches: number;
  currentStreak: number;
  photoDataUrl?: string;
  playerId: string;
  playerName: string;
  streakRank?: number;
  totalMatches: number;
}

export interface PlayerOfMatchRankings {
  attendance: PlayerAttendanceRankingRow[];
  currentPlayer?: PlayerOfMatchCurrentRanking;
  mvp: PlayerOfMatchRankingRow[];
  streaks: PlayerStreakRankingRow[];
}

export interface PlayerOfMatchData {
  matches: PlayerOfMatchMatch[];
  rankings: PlayerOfMatchRankings;
  emptyState: {
    title: string;
    description: string;
  };
  source: DataSourceState;
}

export interface SubmitPlayerOfMatchVoteInput {
  matchId: string;
  voterUserId: string;
  voterPlayerId?: string;
  voterName: string;
  firstVotePlayerName: string;
  secondVotePlayerName: string;
}

export interface UpdatePlayerOfMatchMatchInput {
  matchId: string;
  date: string;
  rival: string;
  sourceType: LeagueCompetitionKind;
  players: string[];
  updatedByUserId: string;
  updatedByName: string;
}
