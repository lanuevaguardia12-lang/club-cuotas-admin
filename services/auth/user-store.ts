import type { AuthUser } from "@/types/auth";

export interface UserCredentials {
  username: string;
  password: string;
}

export interface UserStore {
  findByCredentials(credentials: UserCredentials): Promise<AuthUser | null>;
}
