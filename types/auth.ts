export type AuthRole = "admin" | "treasurer" | "coach" | "player" | "fan";

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: AuthRole;
  playerId?: string;
}

export interface AuthSession {
  user: AuthUser;
  expiresAt: number;
}
