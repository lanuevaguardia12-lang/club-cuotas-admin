import type { DataSourceState } from "@/types/dashboard";

export type PlayerDirectoryStatus = "active" | "inactive";

export interface PlayerDirectoryItem {
  id: string;
  name: string;
  phone: string;
  email: string;
  category: string;
  dni: string;
  jerseyNumber: string;
  birthDate: string;
  position: string;
  secondPosition: string;
  notes: string;
  status: PlayerDirectoryStatus;
  joinedAt: string;
  leftAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerDirectoryData {
  players: PlayerDirectoryItem[];
  emptyState: {
    title: string;
    description: string;
  };
  source: DataSourceState;
}

export interface UpsertPlayerInput {
  id?: string;
  name: string;
  phone?: string;
  email?: string;
  category?: string;
  dni?: string;
  jerseyNumber?: string;
  birthDate?: string;
  position?: string;
  secondPosition?: string;
  notes?: string;
  status?: PlayerDirectoryStatus;
}
