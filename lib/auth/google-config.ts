import "server-only";
import { directoryDatabaseEnabled } from "@/services/database/directory-store";

export function googleAuthEnabled() {
  return Boolean(
    directoryDatabaseEnabled() &&
    process.env.GOOGLE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_CLIENT_SECRET?.trim() &&
    process.env.AUTH_SECRET,
  );
}
export function googleAuthConfig() {
  if (!googleAuthEnabled()) throw new Error("GOOGLE_NOT_CONFIGURED");
  const url = new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://club-cuotas-admin.vercel.app",
  );
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(process.env.NODE_ENV !== "production" && url.hostname === "localhost"))
  )
    throw new Error("GOOGLE_NOT_CONFIGURED");
  return {
    clientId: process.env.GOOGLE_CLIENT_ID!.trim(),
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
    origin: url.origin,
    callbackUrl: `${url.origin}/api/auth/google/callback`,
  };
}
