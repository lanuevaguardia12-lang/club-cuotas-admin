import { getConfiguredAuthUsers } from "@/services/auth/env-admin-user-store";
import type { IDataService } from "@/services/IDataService";
import type { AccountUser } from "@/types/account";

export async function getCurrentCoachName(
  dataService: Pick<IDataService, "getAccountUsers">,
) {
  const users = new Map<string, Pick<AccountUser, "name" | "role" | "username">>();

  for (const user of getConfiguredAuthUsers()) {
    users.set(user.username, {
      name: user.name,
      role: user.role,
      username: user.username,
    });
  }

  const sheetUsers = await dataService.getAccountUsers().catch(() => []);

  for (const user of sheetUsers) {
    users.set(user.username, {
      name: user.name,
      role: user.role,
      username: user.username,
    });
  }

  return (
    Array.from(users.values())
      .filter((user) => user.role === "coach")
      .map((user) => user.name.trim())
      .find(Boolean) ?? ""
  );
}
