import "server-only";

import { timingSafeEqual } from "node:crypto";

import type { UserCredentials, UserStore } from "@/services/auth/user-store";
import type { AuthRole, AuthUser } from "@/types/auth";

interface EnvUserRecord {
  id?: string;
  username?: string;
  password?: string;
  name?: string;
  role?: string;
  playerId?: string;
}

export class EnvAdminUserStore implements UserStore {
  async findByCredentials(credentials: UserCredentials): Promise<AuthUser | null> {
    const users = getEnvUsers();

    if (users.length === 0) {
      throw new Error("ADMIN_USERNAME/ADMIN_PASSWORD or AUTH_USERS_JSON are required.");
    }

    return (
      users.find(
        (user) =>
          safeCompare(credentials.username, user.username) &&
          safeCompare(credentials.password, user.password),
      ) ?? null
    );
  }
}

function getEnvUsers() {
  const usersFromJson = parseAuthUsersJson();
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminUser =
    adminUsername && adminPassword
      ? {
          id: process.env.ADMIN_USER_ID ?? adminUsername,
          username: adminUsername,
          password: adminPassword,
          name: process.env.ADMIN_NAME ?? adminUsername,
          role: "admin" as const,
        }
      : null;

  return [...usersFromJson, ...(adminUser ? [adminUser] : [])];
}

function parseAuthUsersJson() {
  const rawUsers = process.env.AUTH_USERS_JSON;

  if (!rawUsers) {
    return [];
  }

  const parsed = JSON.parse(rawUsers) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("AUTH_USERS_JSON must be an array.");
  }

  return parsed.flatMap((item, index) => {
    const record = item as EnvUserRecord;
    const username = String(record.username ?? "").trim();
    const password = String(record.password ?? "");
    const role = normalizeRole(record.role);

    if (!username || !password || !role) {
      throw new Error(`AUTH_USERS_JSON has an invalid user at index ${index}.`);
    }

    return {
      id: String(record.id ?? username),
      username,
      password,
      name: String(record.name ?? username),
      role,
      playerId:
        role === "player"
          ? String(record.playerId ?? record.id ?? "").trim() || undefined
          : undefined,
    };
  });
}

function normalizeRole(role: unknown): AuthRole | null {
  if (role === "admin" || role === "treasurer" || role === "coach" || role === "player") {
    return role;
  }

  return null;
}

function safeCompare(value: string, expected: string) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  if (valueBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(valueBuffer, expectedBuffer);
}
