import type { AuthRole } from "@/types/auth";
import type { DataSourceState } from "@/types/dashboard";

export interface AccountProfile {
  userId: string;
  username: string;
  role: AuthRole;
  name: string;
  email: string;
  phone: string;
  profilePhotoDataUrl: string;
  updatedAt: string;
  passwordUpdatedAt: string;
}

export interface AccountProfileData {
  profile: AccountProfile;
  source: DataSourceState;
}

export interface AccountAuthOverride {
  userId: string;
  username: string;
  name?: string;
  passwordHash?: string;
}

export interface UpdateAccountProfileInput {
  userId: string;
  username: string;
  role: AuthRole;
  name: string;
  email?: string;
  phone?: string;
  profilePhotoDataUrl?: string;
}

export interface UpdateAccountPasswordInput {
  userId: string;
  username: string;
  role: AuthRole;
  name: string;
  passwordHash: string;
}
