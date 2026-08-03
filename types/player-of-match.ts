import type { DataSourceState } from "@/types/dashboard";

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
  players: string[];
  userVote?: PlayerOfMatchVote;
}

export interface PlayerOfMatchData {
  matches: PlayerOfMatchMatch[];
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
