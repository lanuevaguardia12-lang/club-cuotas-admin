import type { MetadataRoute } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const isIndexable = process.env.NEXT_PUBLIC_SITE_INDEXABLE === "true";

export default function robots(): MetadataRoute.Robots {
  if (!isIndexable) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
      sitemap: `${appUrl}/sitemap.xml`,
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/login"],
      disallow: ["/api/", "/players/", "/reports", "/settings", "/users"],
    },
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
