import { Button } from "@/components/ui/button";

export function GoogleButton({
  mode = "link",
  redirectTo = "/",
  className,
}: {
  mode?: "login" | "link";
  redirectTo?: string;
  className?: string;
}) {
  return (
    <form method="post" action="/api/auth/google/start" className={className}>
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <Button type="submit" variant="outline" className="min-h-11 w-full gap-3">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0">
          <path
            fill="#4285F4"
            d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"
          />
          <path
            fill="#34A853"
            d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.97-3.38.97-2.61 0-4.82-1.76-5.61-4.12H3.05v2.59A10 10 0 0 0 12 22Z"
          />
          <path
            fill="#FBBC05"
            d="M6.39 13.93a6 6 0 0 1 0-3.86V7.48H3.05a10 10 0 0 0 0 9.04l3.34-2.59Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.48l3.34 2.59A5.98 5.98 0 0 1 12 5.95Z"
          />
        </svg>
        {mode === "login" ? "Iniciar sesión con Google" : "Vincular con Google"}
      </Button>
    </form>
  );
}
