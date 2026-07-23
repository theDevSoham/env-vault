import type { MetadataRoute } from "next";
import { SITE } from "@/src/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Authenticated app + API surfaces have no crawlable content.
      disallow: ["/vaults", "/vaults/", "/devices", "/api/"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
