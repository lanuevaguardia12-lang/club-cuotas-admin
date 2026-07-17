export const SESSION_COOKIE_NAME = "dashboard_session";
export const LOGIN_PATH = "/login";
export const DEFAULT_AUTH_REDIRECT = "/";

export const SESSION_MAX_AGE_SECONDS = Number(
  process.env.AUTH_SESSION_MAX_AGE_SECONDS ?? 60 * 60 * 8,
);
