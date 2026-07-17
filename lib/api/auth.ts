import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/auth/roles";
import type { AuthUser } from "@/types/auth";

export async function getApiUser(request: NextRequest): Promise<AuthUser | null> {
  const apiUser = getApiKeyUser(request);

  if (apiUser) {
    return apiUser;
  }

  return getCurrentUser();
}

export async function requireApiPermission(request: NextRequest, permission: Permission) {
  const user = await getApiUser(request);

  if (!user) {
    return {
      response: NextResponse.json({ message: "No autorizado." }, { status: 401 }),
      user: null,
    };
  }

  if (!hasPermission(user, permission)) {
    return {
      response: NextResponse.json(
        { message: "Permisos insuficientes." },
        { status: 403 },
      ),
      user: null,
    };
  }

  return {
    response: null,
    user,
  };
}

function getApiKeyUser(request: NextRequest): AuthUser | null {
  const apiSecret = process.env.API_SECRET;
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!apiSecret || !token || !safeCompare(token, apiSecret)) {
    return null;
  }

  return {
    id: "api",
    username: "api",
    name: "API",
    role: "admin",
  };
}

function safeCompare(value: string, expected: string) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  if (valueBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(valueBuffer, expectedBuffer);
}
