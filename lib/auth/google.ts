import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { jwtVerify, SignJWT } from "jose";
import { googleAuthConfig } from "@/lib/auth/google-config";
import { getSafeRedirectPath } from "@/lib/auth/redirects";
import type { GoogleAuthMode } from "@/services/database/google-auth-store";

export const GOOGLE_FLOW_COOKIE = "club_google_flow";
export const GOOGLE_FLOW_PATH = "/api/auth/google";
const FLOW_AUDIENCE = "club-google-oauth";
export interface GoogleFlow {
  state: string;
  nonce: string;
  verifier: string;
  mode: GoogleAuthMode;
  userId: string | null;
  returnTo: string;
}
const secret = () => {
  if (!process.env.AUTH_SECRET) throw new Error("GOOGLE_NOT_CONFIGURED");
  return new TextEncoder().encode(process.env.AUTH_SECRET);
};
export const equalOAuthValue = (a: string, b: string) => {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
const client = () => {
  const config = googleAuthConfig();
  return new OAuth2Client(config.clientId, config.clientSecret, config.callbackUrl);
};
export function googleReturnTo(value: string | null | undefined) {
  const path = getSafeRedirectPath(value);
  return path.length > 1024 || path.startsWith("/api/auth/") ? "/" : path;
}
export async function createGoogleFlow(
  mode: GoogleAuthMode,
  userId: string | null,
  returnTo: string | null,
) {
  const oauth = client();
  const { codeVerifier, codeChallenge } = await oauth.generateCodeVerifierAsync();
  const flow: GoogleFlow = {
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    verifier: codeVerifier,
    mode,
    userId,
    returnTo: googleReturnTo(returnTo),
  };
  const cookie = await new SignJWT({ ...flow })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(FLOW_AUDIENCE)
    .setAudience(FLOW_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret());
  const url = oauth.generateAuthUrl({
    scope: ["openid", "email"],
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
    prompt: "select_account",
    access_type: "online",
  });
  return { flow, cookie, url };
}
export async function readGoogleFlow(
  cookie: string | undefined,
  state: string | null,
): Promise<GoogleFlow> {
  if (!cookie || !state) throw new Error("GOOGLE_FLOW_INVALID");
  const { payload } = await jwtVerify(cookie, secret(), {
    algorithms: ["HS256"],
    issuer: FLOW_AUDIENCE,
    audience: FLOW_AUDIENCE,
  });
  if (
    typeof payload.state !== "string" ||
    !equalOAuthValue(payload.state, state) ||
    typeof payload.nonce !== "string" ||
    typeof payload.verifier !== "string" ||
    (payload.mode !== "link" && payload.mode !== "login") ||
    (payload.mode === "link"
      ? typeof payload.userId !== "string"
      : payload.userId !== null) ||
    typeof payload.returnTo !== "string"
  )
    throw new Error("GOOGLE_FLOW_INVALID");
  return {
    state: payload.state,
    nonce: payload.nonce,
    verifier: payload.verifier,
    mode: payload.mode,
    userId: payload.userId as string | null,
    returnTo: googleReturnTo(payload.returnTo),
  };
}
export async function verifyGoogleCode(code: string, flow: GoogleFlow) {
  const oauth = client();
  const { tokens } = await oauth.getToken({ code, codeVerifier: flow.verifier });
  if (!tokens.id_token) throw new Error("GOOGLE_TOKEN_INVALID");
  const ticket = await oauth.verifyIdToken({
    idToken: tokens.id_token,
    audience: googleAuthConfig().clientId,
  });
  const payload = ticket.getPayload();
  const nonce = (payload as unknown as { nonce?: unknown } | undefined)?.nonce;
  if (
    !payload?.sub ||
    payload.sub.length > 255 ||
    !payload.email ||
    payload.email.length > 320 ||
    payload.email_verified !== true ||
    typeof nonce !== "string" ||
    !equalOAuthValue(nonce, flow.nonce)
  )
    throw new Error("GOOGLE_TOKEN_INVALID");
  return { subject: payload.sub, email: payload.email };
}
