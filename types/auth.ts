export type AuthRole = "admin" | "treasurer" | "coach";

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: AuthRole;
}

export interface AuthSession {
  user: AuthUser;
  expiresAt: number;
}
