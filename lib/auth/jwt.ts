import { jwtVerify, SignJWT } from "jose";

import { SESSION_MAX_AGE_SECONDS } from "@/lib/auth/constants";
import type { AuthSession, AuthUser } from "@/types/auth";

interface SessionTokenPayload {
  sub: string;
  username: string;
  name: string;
  role: AuthUser["role"];
  playerId?: string;
}

function getJwtSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error("AUTH_SECRET is required to sign authentication tokens.");
  }

  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: AuthUser) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;

  return new SignJWT({
    username: user.username,
    name: user.name,
    role: user.role,
    playerId: user.playerId,
  } satisfies Omit<SessionTokenPayload, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getJwtSecret());
}

export async function verifySessionToken(
  token?: string | null,
): Promise<AuthSession | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const user = toAuthUser(payload);

    if (!user || !payload.exp) {
      return null;
    }

    return {
      user,
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}

function toAuthUser(payload: unknown): AuthUser | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const id = record.sub;
  const username = record.username;
  const name = record.name;
  const role = record.role;
  const playerId = record.playerId;

  if (
    typeof id !== "string" ||
    typeof username !== "string" ||
    typeof name !== "string" ||
    (role !== "admin" && role !== "treasurer" && role !== "coach" && role !== "player")
  ) {
    return null;
  }

  return {
    id,
    username,
    name,
    role,
    playerId: typeof playerId === "string" ? playerId : undefined,
  };
}
