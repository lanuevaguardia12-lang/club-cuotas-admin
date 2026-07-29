"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { forwardRef } from "react";

import { useNavigationLoading } from "@/components/providers/navigation-loading-provider";

type NavigationLinkProps = React.ComponentProps<typeof Link> & {
  loadingMessage?: string;
};

export const NavigationLink = forwardRef<HTMLAnchorElement, NavigationLinkProps>(
  ({ href, loadingMessage = "Cargando sección...", onClick, target, ...props }, ref) => {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { showNavigationLoading } = useNavigationLoading();
    const hrefString = stringifyHref(href);
    const currentUrl = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

    return (
      <Link
        ref={ref}
        href={href}
        target={target}
        onClick={(event) => {
          onClick?.(event);

          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            target === "_blank" ||
            !hrefString.startsWith("/") ||
            hrefString === currentUrl
          ) {
            return;
          }

          showNavigationLoading(loadingMessage);
        }}
        {...props}
      />
    );
  },
);

NavigationLink.displayName = "NavigationLink";

function stringifyHref(href: NavigationLinkProps["href"]) {
  if (typeof href === "string") {
    return href;
  }

  const pathname = href.pathname ?? "";
  const query = href.query
    ? new URLSearchParams(href.query as Record<string, string>)
    : "";

  return `${pathname}${query ? `?${query.toString()}` : ""}`;
}
