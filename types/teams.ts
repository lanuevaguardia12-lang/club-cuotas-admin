import type { DataSourceState } from "@/types/dashboard";

export interface TeamProfile {
  id: string;
  name: string;
  shortName: string;
  crestDataUrl: string;
  updatedAt: string;
}

export interface TeamsData {
  teams: TeamProfile[];
  emptyState: {
    title: string;
    description: string;
  };
  source: DataSourceState;
}

export interface UpsertTeamProfileInput {
  crestDataUrl?: string;
  id?: string;
  name: string;
  shortName?: string;
}
