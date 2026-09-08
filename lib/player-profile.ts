import "server-only";

import { getDataService } from "@/services/data-service";
import type { AuthUser } from "@/types/auth";

export async function findPlayerProfileForUser(user: AuthUser, year?: number) {
  const dataService = getDataService();

  for (const lookup of getPlayerLookupCandidates(user)) {
    const profile = await dataService.getPlayerProfile(lookup, year);

    if (profile) {
      return profile;
    }
  }

  return null;
}

export function getPlayerLookupCandidates(user: AuthUser) {
  return Array.from(
    new Set(
      [user.playerId, user.id, user.username, user.name]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export function parseYear(year?: string) {
  const parsed = Number(year);

  return Number.isInteger(parsed) && parsed >= 2020 && parsed <= 2100
    ? parsed
    : undefined;
}

export function getCurrentPeriod() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}`;
}

export function formatPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1, 1);

  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(date);
}
