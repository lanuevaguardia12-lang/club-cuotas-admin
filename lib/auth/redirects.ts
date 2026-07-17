import { DEFAULT_AUTH_REDIRECT } from "@/lib/auth/constants";

export function getSafeRedirectPath(
  value: FormDataEntryValue | string | null | undefined,
) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_AUTH_REDIRECT;
  }

  if (value.startsWith("/login")) {
    return DEFAULT_AUTH_REDIRECT;
  }

  return value;
}
