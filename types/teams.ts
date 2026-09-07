import type { DataSourceState } from "@/types/dashboard";

export interface TeamCrestFit {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

export interface TeamProfile {
  id: string;
  name: string;
  shortName: string;
  crestDataUrl: string;
  crestOffsetX: number;
  crestOffsetY: number;
  crestZoom: number;
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
  crestOffsetX?: number;
  crestOffsetY?: number;
  crestZoom?: number;
  id?: string;
  name: string;
  shortName?: string;
}
