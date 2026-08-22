import type { AuthRole } from "@/types/auth";
import type { DataSourceState } from "@/types/dashboard";

export interface AccountProfile {
  userId: string;
  username: string;
  role: AuthRole;
  playerId?: string;
  name: string;
  birthDate: string;
  email: string;
  phone: string;
  profilePhotoDataUrl: string;
  player?: AccountPlayerProfile;
  updatedAt: string;
  passwordUpdatedAt: string;
}

export interface AccountPlayerProfile {
  id: string;
  name: string;
  category: string;
  dni: string;
  birthDate: string;
  position: string;
  secondPosition: string;
  status: string;
  mvpWins: number;
  attendance: PlayerAttendanceSummary;
}

export interface PlayerAttendanceSummary {
  attendedMatches: number;
  attendanceRate: number;
  bestStreak: number;
  calculatedAt: string;
  currentStreak: number;
  lastAttendanceDate: string;
  lastAttendanceRival: string;
  seasonStartDate: string;
  seasonYear: number;
  totalMatches: number;
}

export interface AccountProfileData {
  profile: AccountProfile;
  source: DataSourceState;
}

export interface AccountAuthOverride {
  userId: string;
  username: string;
  name?: string;
  role?: AuthRole;
  playerId?: string;
  passwordHash?: string;
}

export interface AccountUser {
  userId: string;
  username: string;
  role: AuthRole;
  playerId?: string;
  name: string;
  birthDate: string;
  email: string;
  phone: string;
  hasPassword: boolean;
  passwordUpdatedAt: string;
  updatedAt: string;
  source: "env" | "sheet" | "env+sheet";
}

export interface CreateFanAccountInput {
  userId: string;
  username: string;
  name: string;
  birthDate: string;
  passwordHash: string;
}

export interface CreateAccountUserInput {
  userId: string;
  username: string;
  role: AuthRole;
  playerId?: string;
  name: string;
  birthDate?: string;
  email?: string;
  phone?: string;
  passwordHash: string;
}

export interface UpdateAccountProfileInput {
  userId: string;
  username: string;
  role: AuthRole;
  playerId?: string;
  name: string;
  birthDate?: string;
  dni?: string;
  email?: string;
  phone?: string;
  position?: string;
  profilePhotoDataUrl?: string;
  secondPosition?: string;
}

export interface UpdateAccountPasswordInput {
  userId: string;
  username: string;
  role: AuthRole;
  name: string;
  passwordHash: string;
}
