import "server-only";

import { EnvAdminUserStore } from "@/services/auth/env-admin-user-store";
import type { UserCredentials, UserStore } from "@/services/auth/user-store";

export class AuthService {
  constructor(private readonly userStore: UserStore) {}

  authenticate(credentials: UserCredentials) {
    return this.userStore.findByCredentials(credentials);
  }
}

export function createAuthService() {
  return new AuthService(new EnvAdminUserStore());
}
