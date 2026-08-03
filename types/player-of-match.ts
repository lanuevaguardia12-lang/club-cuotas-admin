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
  results: PlayerOfMatchResult[];
  totalVotes: number;
  totalVoters: number;
  votingStartsAt: string;
  votingEndsAt: string;
  votingStatus: "open" | "closed";
  userVote?: PlayerOfMatchVote;
}

export interface PlayerOfMatchResult {
  playerName: string;
  photoDataUrl?: string;
  rank: number;
  votes: number;
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
